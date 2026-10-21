import { useState, type ClipboardEvent, type FormEvent } from 'react'

import type { LinkJobStatus, LinkUrlStatus } from './api'
import { AlertIcon, CheckIcon, CloseIcon, GlobeIcon, PlusIcon } from './icons'

const MAX_LINKS = 5

type LinkImportProps = {
  urls:     string[]
  onChange: (urls: string[]) => void
  disabled: boolean
  job:      LinkJobStatus | null                                                // set once an import has started
  onError:  (message: string) => void
}

/** Returns a normalized http(s) URL, or null if the text isn't one. */
function toUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

function splitUrl(url: string): { host: string; path: string } {
  const u = new URL(url)
  const path = `${u.pathname === '/' ? '' : u.pathname}${u.search}`
  return { host: u.hostname.replace(/^www\./, ''), path }
}

export function LinkImport({ urls, onChange, disabled, job, onError }: LinkImportProps) {
  const [draft, setDraft] = useState('')

  /** Add every URL found in the text (paste several separated by spaces, commas or new lines). */
  const addFrom = (text: string) => {
    const parts = text.split(/[\s,]+/).filter(Boolean)
    const valid = parts.map(toUrl).filter((u): u is string => !!u)
    const next = [...urls]
    for (const u of valid) {
      if (!next.includes(u) && next.length < MAX_LINKS) next.push(u)
    }
    if (parts.length && !valid.length) {
      onError('That doesn’t look like a web address. Try something like https://example.com/club-rules')
      return false
    }
    if (urls.length + valid.length > MAX_LINKS) {
      onError(`You can import up to ${MAX_LINKS} pages at a time.`)
    }
    onChange(next)
    return true
  }

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    if (addFrom(draft)) setDraft('')
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (/[\s,]/.test(text.trim())) {                                             // several links pasted at once
      e.preventDefault()
      addFrom(text)
    }
  }

  if (job) {
    return <LinkProgress job={job} />
  }

  return (
    <div className="links">
      <div className="url-field">
        <span className="url-field-icon"><GlobeIcon size={16} /></span>
        <input
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd(e)}
          onPaste={handlePaste}
          placeholder="https://example.com/club-rules"
          aria-label="Web page address"
          disabled={disabled || urls.length >= MAX_LINKS}
        />
        <button
          type="button"
          className="url-add"
          onClick={handleAdd}
          disabled={disabled || !draft.trim() || urls.length >= MAX_LINKS}
          aria-label="Add link"
        >
          <PlusIcon size={16} />
        </button>
      </div>

      {urls.length === 0 ? (
        <p className="links-empty">
          Paste one or more page links — the readable text is pulled out of each page (menus and ads are skipped).
        </p>
      ) : (
        <ul className="link-list">
          {urls.map((url) => {
            const { host, path } = splitUrl(url)
            return (
              <li key={url} className="link-row">
                <span className="link-favicon">{host.charAt(0).toUpperCase()}</span>
                <span className="link-text" title={url}>
                  <span className="link-host">{host}</span>
                  <span className="link-path">{path}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onChange(urls.filter((u) => u !== url))}
                  disabled={disabled}
                  aria-label={`Remove ${url}`}
                >
                  <CloseIcon size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="links-count">{urls.length} / {MAX_LINKS} pages</p>
    </div>
  )
}

const STATUS_LABEL: Record<LinkUrlStatus['status'], string> = {
  pending:    'Queued',
  processing: 'Reading…',
  succeeded:  'Added',
  failed:     'Failed',
}

/** Live per-page progress of a background link import. */
function LinkProgress({ job }: { job: LinkJobStatus }) {
  const finished = job.succeeded + job.failed
  const percent = job.total ? Math.round((finished / job.total) * 100) : 0

  return (
    <div className="links" aria-live="polite">
      <div className="progress-head">
        <span>{job.isProcessing ? 'Importing pages…' : 'Import finished'}</span>
        <span className="progress-count">{finished} / {job.total}</span>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.max(percent, job.isProcessing ? 6 : 0)}%` }} />
      </div>

      <ul className="link-list">
        {job.urls.map((entry) => {
          const { host, path } = splitUrl(entry.url)
          return (
            <li key={entry.url} className={`link-row link-row-${entry.status}`}>
              <span className="link-state" aria-hidden="true">
                {entry.status === 'succeeded' && <CheckIcon size={15} />}
                {entry.status === 'failed' && <AlertIcon size={15} />}
                {(entry.status === 'pending' || entry.status === 'processing') && (
                  <span className={`spinner ${entry.status === 'pending' ? 'spinner-idle' : ''}`} />
                )}
              </span>
              <span className="link-text" title={entry.url}>
                <span className="link-host">{host}</span>
                <span className="link-path">
                  {entry.status === 'failed' && entry.error ? entry.error : path}
                </span>
              </span>
              <span className={`pill pill-${entry.status}`}>
                {STATUS_LABEL[entry.status]}
                {entry.status === 'succeeded' && entry.importedChunks !== undefined &&
                  ` · ${entry.importedChunks} chunk${entry.importedChunks === 1 ? '' : 's'}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
