// Thin client for the NestJS RAG API.
import { createSseParser } from './sse'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Absolute backend URL for links opened in a new tab (Swagger etc.); dev falls back to the local API. */
export const BACKEND_URL = API_URL || 'http://localhost:3000'
export const SWAGGER_URL = `${BACKEND_URL}/api`
export const OPENAPI_JSON_URL = `${BACKEND_URL}/api-json`
export const GITHUB_URL = 'https://github.com/josephamal10/rag-knowledge-base-api'

export const CATEGORIES = [
  { id: 'golf-rules',       label: 'Golf & course rules' },
  { id: 'lodging-info',     label: 'Lodging' },
  { id: 'events-info',      label: 'Events' },
  { id: 'contact-info',     label: 'Contact details' },
  { id: 'real-estate-info', label: 'Real estate' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export type AnswerSource = {
  id:       string
  text:     string
  category: string | null
  title:    string | null
  score:    number | null
}

export type AskResponse = {
  answer:             string
  courseId:           string
  categories:         CategoryId[]
  needsClarification: boolean
  scope:              'broad' | 'specific' | null
  sources:            AnswerSource[]
  standaloneQuestion: string
}

export type AskMeta = Pick<AskResponse, 'courseId' | 'categories' | 'scope' | 'standaloneQuestion'>

export type IngestResponse = {
  importedChunks: number
  indexed:        { skipped: number; added: number; deleted: number }
  courseId:       string
  category:       CategoryId
}

/** HTTP error that keeps the status, so the UI can react to 401 (admin key needed) and 429 (rate limit). */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const UNREACHABLE = 'Cannot reach the server. Is the backend running?'

function errorFrom(status: number, body: unknown): ApiError {
  if (status === 429) {
    return new ApiError("You're asking a bit too fast — please wait a minute and try again.", status)
  }
  // Nest errors look like { message: string | string[], details?: unknown }
  const raw = (body as { message?: unknown } | null)?.message
  const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : ''
  return new ApiError(message || `Request failed (${status})`, status)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')                            // FormData sets its own boundary
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new Error(UNREACHABLE)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw errorFrom(response.status, body)
  }
  return body as T
}

const adminHeaders = (adminKey?: string): HeadersInit => (adminKey ? { 'x-admin-key': adminKey } : {})

export function ask(question: string, courseId: string, history: ChatTurn[] = []): Promise<AskResponse> {
  return request('/ask', {
    method: 'POST',
    body:   JSON.stringify({ question, courseId, history }),
  })
}

export type StreamHandlers = {
  onMeta?:  (meta: AskMeta) => void
  onDelta:  (text: string) => void
}

/** Streams the answer (Server-Sent Events) and resolves with the final result, including sources. */
export async function askStream(
  question: string,
  courseId: string,
  history: ChatTurn[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<AskResponse> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/ask/stream`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, courseId, history }),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new Error(UNREACHABLE)
  }

  if (!response.ok || !response.body) {
    throw errorFrom(response.status, await response.json().catch(() => null))
  }

  // Filled in by the parser callback (an object, so TypeScript doesn't narrow it away).
  const outcome: { result: AskResponse | null; error: string | null } = { result: null, error: null }
  const parse = createSseParser(({ event, data }) => {
    const payload = JSON.parse(data)
    if (event === 'meta') handlers.onMeta?.(payload as AskMeta)
    else if (event === 'delta') handlers.onDelta(payload.text as string)
    else if (event === 'done') outcome.result = payload.result as AskResponse
    else if (event === 'error') outcome.error = payload.message as string
  })

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parse(value)
  }

  if (outcome.error) throw new Error(outcome.error)
  if (!outcome.result) throw new Error('The answer stream ended unexpectedly.')
  return outcome.result
}

export function addText(
  text: string,
  courseId: string,
  category: CategoryId,
  adminKey?: string,
): Promise<IngestResponse> {
  return request('/kb/text', {
    method:  'POST',
    headers: adminHeaders(adminKey),
    body:    JSON.stringify({ text, courseId, category }),
  })
}

/** Upload a PDF / DOCX / TXT file; the backend extracts, chunks and indexes it. */
export function uploadFile(
  file: File,
  courseId: string,
  category: CategoryId,
  adminKey?: string,
): Promise<IngestResponse> {
  const form = new FormData()
  form.append('courseId', courseId)
  form.append('category', category)
  form.append('file', file)
  return request('/rules/import', { method: 'POST', headers: adminHeaders(adminKey), body: form })
}

export type LinkUrlStatus = {
  url:             string
  status:          'pending' | 'processing' | 'succeeded' | 'failed'
  importedChunks?: number
  error?:          string
  attempts?:       number
}

export type LinkJobStatus = {
  isProcessing: boolean
  courseId:     string | null
  category:     string | null
  startedAt:    string | null
  finishedAt:   string | null
  total:        number
  succeeded:    number
  failed:       number
  pending:      number
  urls:         LinkUrlStatus[]
}

/** Queue web pages for background import; poll getLinkStatus() for progress. */
export function addLinks(
  urls: string[],
  courseId: string,
  category: CategoryId,
  adminKey?: string,
): Promise<{ message: string; count: number }> {
  return request('/kb/link', {
    method:  'POST',
    headers: adminHeaders(adminKey),
    body:    JSON.stringify({ urls, courseId, category }),
  })
}

export function getLinkStatus(): Promise<LinkJobStatus> {
  return request('/kb/link/status')
}

export function listCourses(): Promise<string[]> {
  return request('/rules/courses')
}

export async function isHealthy(): Promise<boolean> {
  try {
    const body = await request<{ status: string }>('/health')
    return body.status === 'ok'
  } catch {
    return false
  }
}
