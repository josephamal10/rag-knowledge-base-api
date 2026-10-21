import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'

import { CloseIcon, UploadIcon } from './icons'

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const
const MAX_FILE_MB = 10

type FileDropzoneProps = {
  file:     File | null
  disabled: boolean
  onFile:   (file: File | null) => void
  onError:  (message: string) => void
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Drag-and-drop (or click to browse) picker for one PDF / DOCX / TXT file. */
export function FileDropzone({ file, disabled, onFile, onError }: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (candidate: File | undefined) => {
    if (!candidate) return
    const ext = extensionOf(candidate.name)
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      onError('That file type isn’t supported. Please use a PDF, Word (.docx) or .txt file.')
      return
    }
    if (candidate.size > MAX_FILE_MB * 1024 * 1024) {
      onError(`That file is ${formatSize(candidate.size)} — the limit is ${MAX_FILE_MB} MB.`)
      return
    }
    onFile(candidate)
  }

  const browse = () => !disabled && input.current?.click()

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) accept(e.dataTransfer.files?.[0])
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      browse()
    }
  }

  const hiddenInput = (
    <input
      ref={input}
      type="file"
      hidden
      accept={ACCEPTED_EXTENSIONS.map((x) => `.${x}`).join(',')}
      onChange={(e) => {
        accept(e.target.files?.[0])
        e.target.value = ''                                                      // allow re-picking the same file
      }}
    />
  )

  if (file) {
    const ext = extensionOf(file.name)
    return (
      <div className="file-card">
        <span className={`file-badge file-badge-${ext}`}>{ext.toUpperCase()}</span>
        <div className="file-info">
          <p className="file-name" title={file.name}>{file.name}</p>
          <p className="file-meta">
            {formatSize(file.size)} ·{' '}
            <button type="button" className="link" onClick={browse} disabled={disabled}>Replace</button>
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onFile(null)}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
        >
          <CloseIcon size={16} />
        </button>
        {hiddenInput}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Choose a file to upload, or drag and drop it here"
      aria-disabled={disabled}
      className={`dropzone ${dragging ? 'is-dragging' : ''}`}
      onClick={browse}
      onKeyDown={handleKey}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <span className="dropzone-icon"><UploadIcon size={22} /></span>
      <p className="dropzone-title">
        {dragging ? 'Drop it here' : <>Drag &amp; drop a file, or <span className="accent">browse</span></>}
      </p>
      <div className="dropzone-formats">
        {ACCEPTED_EXTENSIONS.map((x) => (
          <span key={x} className={`file-badge file-badge-${x} file-badge-sm`}>{x.toUpperCase()}</span>
        ))}
        <span className="dropzone-limit">up to {MAX_FILE_MB} MB</span>
      </div>
      {hiddenInput}
    </div>
  )
}
