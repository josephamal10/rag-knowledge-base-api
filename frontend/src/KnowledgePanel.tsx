import { useEffect, useState, type FormEvent } from 'react'

import {
  addLinks,
  addText,
  ApiError,
  CATEGORIES,
  getLinkStatus,
  uploadFile,
  type CategoryId,
  type LinkJobStatus,
} from './api'
import { FileDropzone } from './FileDropzone'
import { FileIcon, LinkIcon, TextIcon } from './icons'
import { LinkImport } from './LinkImport'

type KnowledgePanelProps = {
  courseId: string
  onAdded:  () => void
  onClose:  () => void
}

type Mode = 'text' | 'file' | 'link'
type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; text: string } | { kind: 'error'; text: string }

const MODES: { id: Mode; label: string; Icon: typeof TextIcon; hint: string }[] = [
  { id: 'text', label: 'Text', Icon: TextIcon, hint: 'Paste any text' },
  { id: 'file', label: 'File', Icon: FileIcon, hint: 'PDF, Word or TXT' },
  { id: 'link', label: 'Link', Icon: LinkIcon, hint: 'Import web pages' },
]

const POLL_MS = 1200

export function KnowledgePanel({ courseId, onAdded, onClose }: KnowledgePanelProps) {
  const [mode, setMode] = useState<Mode>('text')
  const [category, setCategory] = useState<CategoryId>('golf-rules')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [job, setJob] = useState<LinkJobStatus | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // Only shown after the server asks for it (public demo with ADMIN_API_KEY set).
  const [adminKey, setAdminKey] = useState('')
  const [needsKey, setNeedsKey] = useState(false)

  const busy = status.kind === 'saving' || !!job?.isProcessing

  // Poll the background link job until every page is done.
  useEffect(() => {
    if (!job?.isProcessing) return
    const timer = window.setInterval(async () => {
      try {
        const next = await getLinkStatus()
        setJob(next)
        if (!next.isProcessing) {
          onAdded()
          setStatus(
            next.failed
              ? { kind: 'error', text: `${next.succeeded} of ${next.total} page(s) imported — ${next.failed} failed.` }
              : { kind: 'done', text: `Imported ${next.succeeded} page${next.succeeded === 1 ? '' : 's'}. You can ask about them now.` },
          )
        }
      } catch {
        // Keep polling; a single failed status request isn't fatal.
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [job?.isProcessing, onAdded])

  const switchMode = (next: Mode) => {
    if (busy) return
    setMode(next)
    setStatus({ kind: 'idle' })
  }

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) setNeedsKey(true)
    setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
  }

  const canSubmit =
    !busy && (mode === 'text' ? !!text.trim() : mode === 'file' ? !!file : urls.length > 0 && !job)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setStatus({ kind: 'saving' })
    const key = adminKey.trim() || undefined

    try {
      if (mode === 'link') {
        await addLinks(urls, courseId, category, key)
        setJob(await getLinkStatus())
        setStatus({ kind: 'idle' })
        return
      }

      const result = mode === 'text'
        ? await addText(text.trim(), courseId, category, key)
        : await uploadFile(file as File, courseId, category, key)

      const what = mode === 'file' && file ? `“${file.name}”` : 'your text'
      setStatus({
        kind: 'done',
        text: `Added ${what} as ${result.importedChunks} chunk${result.importedChunks === 1 ? '' : 's'}. ` +
          'You can ask about it now.',
      })
      setText('')
      setFile(null)
      onAdded()
    } catch (err) {
      fail(err)
    }
  }

  const resetLinks = () => {
    setJob(null)
    setUrls([])
    setStatus({ kind: 'idle' })
  }

  const submitLabel = (() => {
    if (status.kind === 'saving') return mode === 'file' ? 'Uploading & indexing…' : mode === 'link' ? 'Starting import…' : 'Adding…'
    if (mode === 'file') return 'Upload & index'
    if (mode === 'link') return urls.length > 1 ? `Import ${urls.length} pages` : 'Import page'
    return 'Add to knowledge base'
  })()

  return (
    <aside className="panel" aria-label="Add knowledge">
      <div className="panel-head">
        <h2>Add knowledge</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      <p className="panel-intro">
        Teach <strong>{courseId}</strong> something new — it's split into chunks, embedded and indexed, then
        the chat can answer from it.
      </p>

      <div className="source-tabs" role="tablist" aria-label="Source type">
        {MODES.map(({ id, label, Icon, hint }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`source-tab ${mode === id ? 'active' : ''}`}
            onClick={() => switchMode(id)}
            disabled={busy && mode !== id}
          >
            <span className="source-tab-icon"><Icon size={18} /></span>
            <span className="source-tab-label">{label}</span>
            <span className="source-tab-hint">{hint}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="panel-form">
        <fieldset className="topics" disabled={busy}>
          <legend>Topic</legend>
          <div className="topic-chips">
            {CATEGORIES.map((c) => (
              <label key={c.id} className={`topic-chip ${category === c.id ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="topic"
                  value={c.id}
                  checked={category === c.id}
                  onChange={() => setCategory(c.id)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'text' && (
          <label>
            <span>Text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              disabled={busy}
              placeholder="e.g. Check-in is from 3 PM and check-out is by 11 AM. Pets are welcome in RV sites."
            />
          </label>
        )}

        {mode === 'file' && (
          <FileDropzone
            file={file}
            disabled={busy}
            onFile={(f) => { setFile(f); setStatus({ kind: 'idle' }) }}
            onError={(text) => setStatus({ kind: 'error', text })}
          />
        )}

        {mode === 'link' && (
          <LinkImport
            urls={urls}
            onChange={(next) => { setUrls(next); setStatus({ kind: 'idle' }) }}
            disabled={busy}
            job={job}
            onError={(text) => setStatus({ kind: 'error', text })}
          />
        )}

        {needsKey && (
          <label>
            <span>Admin key</span>
            <input
              type="password"
              className="text-input"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Needed to add data on the public demo"
              autoComplete="off"
            />
          </label>
        )}

        {mode === 'link' && job && !job.isProcessing ? (
          <button type="button" className="btn btn-secondary" onClick={resetLinks}>Import more links</button>
        ) : (
          <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
            {status.kind === 'saving' && <span className="spinner spinner-light" aria-hidden="true" />}
            {submitLabel}
          </button>
        )}

        {status.kind === 'done' && <p className="notice notice-ok" role="status">{status.text}</p>}
        {status.kind === 'error' && <p className="notice notice-error" role="alert">{status.text}</p>}
      </form>
    </aside>
  )
}
