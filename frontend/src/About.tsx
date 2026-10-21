import { useState } from 'react'

import { ask, GITHUB_URL, isHealthy, OPENAPI_JSON_URL, SWAGGER_URL, type AskResponse } from './api'

const INGEST_STEPS = [
  { title: 'Upload',  text: 'A PDF, Word file, web page or pasted text is sent to the API with a club (courseId) and a topic.' },
  { title: 'Extract', text: 'Plain text is pulled out of the file — pdf-parse for PDFs, mammoth for Word, Readability for web pages.' },
  { title: 'Chunk',   text: 'The text is cut into ~500-character pieces with a small overlap, so no sentence is lost at a boundary.' },
  { title: 'Store',   text: 'Each chunk is saved in SQLite — the master copy the search index can always be rebuilt from.' },
  { title: 'Index',   text: 'Gemini turns each chunk into an embedding (1,536 numbers capturing its meaning); a keyword vector is built too. Both go into Upstash Vector.' },
]

const ANSWER_STEPS = [
  { title: 'Understand', text: 'Follow-ups like “and check-out?” are rewritten into a full question using the last few messages.' },
  { title: 'Route',      text: 'Gemini decides which topic the question is about — golf rules, lodging, events, contact or real estate.' },
  { title: 'Search',     text: 'Hybrid search finds the best chunks by meaning (“dog” ≈ “pets”) and by exact words (“rule 17.1”), merged with RRF.' },
  { title: 'Ground',     text: 'Only the top chunks are given to Gemini, with the instruction: answer from this context and nothing else.' },
  { title: 'Answer',     text: 'The answer streams in word by word, with the source chunks it used — or an honest “I don’t have information about that”.' },
]

const CONCEPTS = [
  { term: 'RAG',            text: 'Retrieval-Augmented Generation: look up the facts first, then let the AI write the answer — like an open-book exam.' },
  { term: 'Embeddings',     text: 'Lists of numbers that represent meaning, so similar sentences end up close together and can be found by similarity.' },
  { term: 'Hybrid search',  text: 'Semantic (dense) search plus keyword (sparse) search, fused with Reciprocal Rank Fusion for more accurate results.' },
  { term: 'Namespaces',     text: 'Each club gets its own isolated section of the vector index, so one club never sees another club’s data (multi-tenancy).' },
  { term: 'Topic routing',  text: 'An LLM classifier picks the relevant topic before searching; vague questions fall back to searching everything.' },
  { term: 'Grounding',      text: 'The model may only use the retrieved text, which prevents made-up answers (hallucinations).' },
  { term: 'Citations',      text: 'Every answer lists the exact chunks it was based on, so you can check where it came from.' },
  { term: 'Streaming',      text: 'Answers arrive word by word over Server-Sent Events instead of after a long pause.' },
  { term: 'Follow-up memory', text: 'Recent messages are sent along with the question, and an LLM rewrites follow-ups into standalone questions.' },
]

const ENDPOINTS = [
  { method: 'POST', path: '/ask',            text: 'Ask a question (RAG) — answer + sources' },
  { method: 'POST', path: '/ask/stream',     text: 'Same, streamed word by word (Server-Sent Events)' },
  { method: 'POST', path: '/kb/text',        text: 'Add pasted text' },
  { method: 'POST', path: '/rules/import',   text: 'Upload a PDF / DOCX / TXT' },
  { method: 'POST', path: '/kb/link',        text: 'Queue web pages (background job)' },
  { method: 'POST', path: '/reindex',        text: 'Re-sync SQLite → vector index' },
  { method: 'GET',  path: '/rules/courses',  text: 'List clubs' },
  { method: 'GET',  path: '/health',         text: 'Health check' },
  { method: '—',    path: '/mcp',            text: 'MCP server for AI agents' },
]

const STACK = [
  { group: 'Backend',       items: ['NestJS', 'TypeScript', 'SQLite', 'TypeORM', 'Zod', 'Swagger / OpenAPI'] },
  { group: 'AI & search',   items: ['Google Gemini', 'gemini-embedding-001', 'Upstash Vector (hybrid)', 'RRF fusion', 'MCP'] },
  { group: 'Ingestion',     items: ['pdf-parse', 'mammoth', 'jsdom', 'Mozilla Readability'] },
  { group: 'Frontend',      items: ['React 19', 'Vite', 'TypeScript', 'CSS (light / dark)'] },
]

export function About({ courseId, onTryChat }: { courseId: string; onTryChat: () => void }) {
  return (
    <div className="about">
      <section className="about-hero">
        <p className="eyebrow">About this project</p>
        <h2>Ask questions. Get answers from <span className="accent">your own documents</span>.</h2>
        <p className="lead">
          RAG Knowledge-Base is an AI assistant for a business — here, a golf club — that answers questions
          using <strong>only</strong> the club's own documents: rules, prices, rooms, events and contact details.
          If the answer isn't in the documents, it says so instead of guessing.
        </p>
        <div className="about-actions">
          <button type="button" className="btn btn-primary" onClick={onTryChat}>Try the chat</button>
          <a className="btn btn-secondary" href={SWAGGER_URL} target="_blank" rel="noreferrer">Open the backend API</a>
          <a className="btn btn-secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">Source code on GitHub</a>
        </div>
        <p className="byline">Built by <strong>Joseph Amal</strong></p>
      </section>

      <section className="about-section">
        <h3>The problem it solves</h3>
        <div className="compare">
          <div className="compare-card">
            <p className="compare-label">A normal AI chatbot</p>
            <p>Doesn't know your club's prices or rules — so it either refuses or <strong>makes something up</strong>.</p>
          </div>
          <div className="compare-card compare-good">
            <p className="compare-label">This project</p>
            <p>Looks up the club's real documents first, answers <strong>only from them</strong>, and admits when something isn't covered.</p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h3>How it works</h3>
        <div className="flows">
          <Flow title="1 · Teaching it (ingestion)" steps={INGEST_STEPS} />
          <Flow title="2 · Answering a question" steps={ANSWER_STEPS} />
        </div>
      </section>

      <section className="about-section">
        <h3>Key ideas, in plain words</h3>
        <dl className="concepts">
          {CONCEPTS.map((c) => (
            <div key={c.term} className="concept">
              <dt>{c.term}</dt>
              <dd>{c.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="about-section backend-card">
        <div className="backend-head">
          <div>
            <p className="eyebrow">The core of the project</p>
            <h3>The backend</h3>
          </div>
          <span className="badge">NestJS REST API</span>
        </div>
        <p>
          All the intelligence lives in the backend: document ingestion, chunking, embeddings, hybrid search,
          topic routing and grounded answer generation. It was developed during my internship at{' '}
          <strong>Nanonino</strong> and is shared with their permission. It works on its own — the chat on this
          site is just one client of it. It is also exposed as an <strong>MCP</strong> tool so AI agents can use it.
        </p>
        <p>
          Production safeguards: per-visitor <strong>rate limiting</strong>, an <strong>admin key</strong> that
          locks every endpoint which changes data (the public demo is read-only), configurable CORS, input
          validation with Zod, plus unit tests and CI on every push.
        </p>

        <div className="proof-links">
          <a className="btn btn-primary" href={SWAGGER_URL} target="_blank" rel="noreferrer">Swagger API docs ↗</a>
          <a className="btn btn-secondary" href={OPENAPI_JSON_URL} target="_blank" rel="noreferrer">OpenAPI spec (JSON) ↗</a>
          <a className="btn btn-secondary" href={`${GITHUB_URL}/tree/main/src`} target="_blank" rel="noreferrer">Backend code ↗</a>
        </div>

        <table className="endpoints">
          <thead>
            <tr><th>Method</th><th>Endpoint</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.path}>
                <td><span className={`method method-${e.method.toLowerCase()}`}>{e.method}</span></td>
                <td><code>{e.path}</code></td>
                <td>{e.text}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <LiveDemo courseId={courseId} />
      </section>

      <section className="about-section">
        <h3>The frontend</h3>
        <p>
          This website was added afterwards to make the backend easy to try: a React chat interface that calls
          the same API shown above. Answers stream in live, show the sources they came from and handle
          follow-up questions. The <em>Add knowledge</em> panel takes pasted text or a PDF / Word file. Light and
          dark mode, mobile-friendly.
        </p>
      </section>

      <section className="about-section">
        <h3>Tech stack</h3>
        <div className="stack">
          {STACK.map((s) => (
            <div key={s.group} className="stack-group">
              <p className="stack-title">{s.group}</p>
              <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h3>What it can't do (yet)</h3>
        <ul className="limits">
          <li>It only knows what's in its documents — it can't see live data such as which tee times are free right now.</li>
          <li>It only remembers the last few messages of the current chat — nothing is stored between visits.</li>
          <li>The demo data is fictional (“demo-club”), written to show how it works.</li>
        </ul>
      </section>

      <footer className="about-footer">
        <span>Built by Joseph Amal</span>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  )
}

function Flow({ title, steps }: { title: string; steps: { title: string; text: string }[] }) {
  return (
    <div className="flow">
      <p className="flow-title">{title}</p>
      <ol className="flow-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="step-num">{i + 1}</span>
            <div>
              <p className="step-title">{s.title}</p>
              <p className="step-text">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

const DEMO_QUESTION = 'What time is check-in?'

/** Keep the raw JSON readable: trim each source's id (a 64-char hash) and text (~500 characters). */
function shortenSources(body: unknown): unknown {
  const sources = (body as { sources?: { id: string; text: string }[] } | null)?.sources
  if (!Array.isArray(sources)) return body
  return {
    ...(body as object),
    sources: sources.map((s) => ({
      ...s,
      id:   s.id.length > 12 ? `${s.id.slice(0, 12)}…` : s.id,
      text: s.text.length > 70 ? `${s.text.slice(0, 70)}… (shortened)` : s.text,
    })),
  }
}

/** Sends a real request to the backend and shows the raw JSON, as proof the chat is backed by the API. */
function LiveDemo({ courseId }: { courseId: string }) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'done'; body: unknown; ms: number; label: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const runAsk = async () => {
    setState({ kind: 'running' })
    const started = performance.now()
    try {
      const body: AskResponse = await ask(DEMO_QUESTION, courseId)
      setState({ kind: 'done', body, ms: Math.round(performance.now() - started), label: 'POST /ask' })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const runHealth = async () => {
    setState({ kind: 'running' })
    const started = performance.now()
    const ok = await isHealthy()
    setState({ kind: 'done', body: { status: ok ? 'ok' : 'unreachable' }, ms: Math.round(performance.now() - started), label: 'GET /health' })
  }

  const request = JSON.stringify({ question: DEMO_QUESTION, courseId }, null, 2)

  return (
    <div className="live-demo">
      <p className="live-title">See it work live</p>
      <p className="live-text">
        These buttons call the real backend from your browser and show exactly what it returns.
      </p>
      <div className="live-buttons">
        <button type="button" className="btn btn-primary" onClick={runAsk} disabled={state.kind === 'running'}>
          Run POST /ask
        </button>
        <button type="button" className="btn btn-secondary" onClick={runHealth} disabled={state.kind === 'running'}>
          Check API health
        </button>
      </div>

      <div className="code-pair">
        <div>
          <p className="code-label">Request · POST /ask</p>
          <pre className="code">{request}</pre>
        </div>
        <div>
          <p className="code-label">
            {state.kind === 'done' ? `Response · ${state.label} · ${(state.ms / 1000).toFixed(1)}s` : 'Response'}
          </p>
          <pre className={`code ${state.kind === 'error' ? 'code-error' : ''}`}>
            {state.kind === 'idle' && '// Click a button to call the API'}
            {state.kind === 'running' && '// Waiting for the backend…'}
            {state.kind === 'done' && JSON.stringify(shortenSources(state.body), null, 2)}
            {state.kind === 'error' && `// ${state.message}`}
          </pre>
        </div>
      </div>
    </div>
  )
}
