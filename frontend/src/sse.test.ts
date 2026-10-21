import { describe, expect, it } from 'vitest'

import { createSseParser, type SseEvent } from './sse'

const parseAll = (chunks: string[]): SseEvent[] => {
  const events: SseEvent[] = []
  const feed = createSseParser((e) => events.push(e))
  chunks.forEach(feed)
  return events
}

describe('createSseParser', () => {
  it('parses complete events', () => {
    expect(parseAll(['event: delta\ndata: {"text":"Hi"}\n\n'])).toEqual([
      { event: 'delta', data: '{"text":"Hi"}' },
    ])
  })

  it('handles events split across network chunks', () => {
    const events = parseAll(['event: me', 'ta\ndata: {"a"', ':1}\n', '\nevent: done\ndata: {}\n\n'])
    expect(events).toEqual([
      { event: 'meta', data: '{"a":1}' },
      { event: 'done', data: '{}' },
    ])
  })

  it('handles several events in one chunk', () => {
    const chunk = 'event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\n'
    expect(parseAll([chunk]).map((e) => e.data)).toEqual(['{"text":"a"}', '{"text":"b"}'])
  })

  it('accepts CRLF line endings', () => {
    expect(parseAll(['event: done\r\ndata: {}\r\n\r\n'])).toEqual([{ event: 'done', data: '{}' }])
  })

  it('joins multi-line data and defaults the event name to "message"', () => {
    expect(parseAll(['data: line 1\ndata: line 2\n\n'])).toEqual([{ event: 'message', data: 'line 1\nline 2' }])
  })

  it('ignores comments and waits for the closing blank line', () => {
    expect(parseAll([': keep-alive\n\n', 'event: delta\ndata: {}\n'])).toEqual([])
  })
})
