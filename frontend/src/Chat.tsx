import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { categoryLabel, type AnswerSource, type AskResponse } from './api'

export type ChatMessage = {
  id:         string
  role:       'user' | 'assistant' | 'error'
  text:       string
  question?:  string                                                           // What the user asked (assistant replies)
  result?:    AskResponse
  streaming?: boolean
  ms?:        number
}

const SUGGESTIONS = [
  'What time is check-in?',
  'What is the penalty for slow play?',
  'Are dogs allowed?',
  'How much is weekend golf?',
]

type ChatProps = {
  courseId: string
  messages: ChatMessage[]
  loading:  boolean
  onSend:   (question: string) => void
  onClear:  () => void
}

export function Chat({ courseId, messages, loading, onSend, onClear }: ChatProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const submit = (text: string) => {
    const question = text.trim()
    if (!question || loading) return
    onSend(question)
    setDraft('')
    inputRef.current?.focus()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(draft)
  }

  // Enter sends; Shift+Enter adds a new line.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(draft)
    }
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="empty">
            <h2>Ask anything about <span className="accent">{courseId}</span></h2>
            <p>
              Answers come only from the documents added for this club. If something isn't covered,
              it will say so instead of guessing.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
            <p className="hint">Tip: follow-ups work too — ask about check-in, then just type “and check-out?”</p>
            <a className="learn-more" href="#/about">New here? See how it works →</a>
          </div>
        ) : (
          <ol className="messages" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className={`msg msg-${m.role}`}>
                {m.streaming && !m.text ? (
                  <div className="bubble typing" aria-label="Thinking">
                    <span /><span /><span />
                  </div>
                ) : (
                  <div className={`bubble ${m.streaming ? 'is-streaming' : ''}`}>{m.text}</div>
                )}
                {m.role === 'assistant' && m.result && (
                  <AnswerMeta result={m.result} question={m.question} ms={m.ms} />
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={1}
          aria-label="Your question"
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !draft.trim()}>
          Send
        </button>
      </form>
      <div className="composer-footer">
        <span>Enter to send · Shift+Enter for a new line</span>
        {messages.length > 0 && (
          <button type="button" className="link" onClick={onClear}>Clear chat</button>
        )}
      </div>
    </section>
  )
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[?.!\s]+$/, '')

function AnswerMeta({ result, question, ms }: { result: AskResponse; question?: string; ms?: number }) {
  // Show how a follow-up was understood, e.g. "and check-out?" → "What time is check-out?"
  const rewritten =
    question && result.standaloneQuestion && normalize(question) !== normalize(result.standaloneQuestion)

  return (
    <>
      <div className="meta">
        {result.needsClarification && <span className="tag tag-warn">Needs clarification</span>}
        {result.categories.map((c) => (
          <span key={c} className="tag">{categoryLabel(c)}</span>
        ))}
        {ms !== undefined && <span className="meta-time">{(ms / 1000).toFixed(1)}s</span>}
      </div>
      {rewritten && (
        <p className="understood">Understood as: “{result.standaloneQuestion}”</p>
      )}
      {result.sources.length > 0 && <Sources sources={result.sources} />}
    </>
  )
}

/** Collapsible list of the document chunks the answer was grounded in. */
function Sources({ sources }: { sources: AnswerSource[] }) {
  return (
    <details className="sources">
      <summary>
        {sources.length} source{sources.length === 1 ? '' : 's'} used
      </summary>
      <ol>
        {sources.map((s, i) => (
          <li key={s.id}>
            <div className="source-head">
              <span className="source-num">{i + 1}</span>
              {s.category && <span className="tag">{categoryLabel(s.category)}</span>}
              {s.title && <span className="source-title">{s.title}</span>}
            </div>
            <p className="source-text">{s.text}</p>
          </li>
        ))}
      </ol>
    </details>
  )
}
