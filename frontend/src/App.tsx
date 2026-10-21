import { useCallback, useEffect, useState } from 'react'

import { About } from './About'
import { askStream, isHealthy, listCourses, type ChatTurn } from './api'
import { Chat, type ChatMessage } from './Chat'
import { KnowledgePanel } from './KnowledgePanel'

const DEFAULT_COURSE_ID = import.meta.env.VITE_DEFAULT_COURSE_ID || 'demo-club'
const INGEST_ENABLED = import.meta.env.VITE_ENABLE_INGEST !== 'false'
const HISTORY_TURNS = 6

let nextId = 0
const newId = () => `m${++nextId}`

type View = 'chat' | 'about'

// Tiny hash router: "#/about" shows the explainer page, anything else shows the chat.
const viewFromHash = (): View => (window.location.hash === '#/about' ? 'about' : 'chat')

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goTo = (next: View) => {
    window.location.hash = next === 'about' ? '/about' : '/'
    window.scrollTo(0, 0)
  }

  const [courseId, setCourseId] = useState(DEFAULT_COURSE_ID)
  const [courses, setCourses] = useState<string[]>([DEFAULT_COURSE_ID])
  const [online, setOnline] = useState<boolean | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)

  const refreshCourses = useCallback(
    () =>
      listCourses()
        .then((ids) => setCourses(Array.from(new Set([DEFAULT_COURSE_ID, ...ids])).sort()))
        .catch(() => {
          // Keep the default course if the list can't be loaded.
        }),
    [],
  )

  useEffect(() => {
    isHealthy().then(setOnline)
    refreshCourses()
  }, [refreshCourses])

  const sendQuestion = async (question: string) => {
    // Recent finished turns go with the question so follow-ups like "and check-out?" work.
    const history: ChatTurn[] = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.streaming && m.text)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role as ChatTurn['role'], content: m.text }))

    const replyId = newId()
    const updateReply = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch(m) } : m)))

    setMessages((prev) => [
      ...prev,
      { id: newId(), role: 'user', text: question },
      { id: replyId, role: 'assistant', text: '', question, streaming: true },
    ])
    setLoading(true)
    const started = performance.now()

    try {
      const result = await askStream(question, courseId, history, {
        onDelta: (text) => updateReply((m) => ({ text: m.text + text })),
      })
      updateReply(() => ({
        text:      result.answer,
        result,
        streaming: false,
        ms:        Math.round(performance.now() - started),
      }))
      setOnline(true)
    } catch (err) {
      updateReply(() => ({
        role:      'error',
        text:      err instanceof Error ? err.message : String(err),
        streaming: false,
      }))
    } finally {
      setLoading(false)
    }
  }

  const switchCourse = (id: string) => {
    setCourseId(id)
    setMessages([])
  }

  return (
    <div className={`app app-${view}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <div>
            <h1>RAG Knowledge-Base</h1>
            <p>Answers grounded in your own documents</p>
          </div>
        </div>

        <nav className="tabs" aria-label="Pages">
          <a href="#/" className={`tab ${view === 'chat' ? 'tab-active' : ''}`} aria-current={view === 'chat' ? 'page' : undefined}>
            Chat
          </a>
          <a href="#/about" className={`tab ${view === 'about' ? 'tab-active' : ''}`} aria-current={view === 'about' ? 'page' : undefined}>
            How it works
          </a>
        </nav>

        <div className="topbar-actions">
          {view === 'chat' && (
            <label className="course-picker">
              <span>Club</span>
              <select value={courseId} onChange={(e) => switchCourse(e.target.value)}>
                {courses.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          )}

          <span className={`status status-${online === null ? 'checking' : online ? 'online' : 'offline'}`}>
            <span className="status-dot" aria-hidden="true" />
            {online === null ? 'Checking…' : online ? 'Online' : 'Offline'}
          </span>

          {view === 'chat' && INGEST_ENABLED && (
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((open) => !open)}
            >
              {panelOpen ? 'Close' : 'Add knowledge'}
            </button>
          )}
        </div>
      </header>

      {view === 'about' ? (
        <main className="about-scroll">
          <About courseId={courseId} onTryChat={() => goTo('chat')} />
        </main>
      ) : (
        <main className={`layout ${panelOpen ? 'layout-with-panel' : ''}`}>
          <Chat
            courseId={courseId}
            messages={messages}
            loading={loading}
            onSend={sendQuestion}
            onClear={() => setMessages([])}
          />

          {INGEST_ENABLED && panelOpen && (
            <KnowledgePanel
              courseId={courseId}
              onAdded={refreshCourses}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </main>
      )}
    </div>
  )
}
