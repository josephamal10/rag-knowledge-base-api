# RAG Knowledge-Base — Frontend

Chat interface for the [RAG Knowledge-Base API](../README.md). Built with **React 19 + TypeScript + Vite**, plain CSS (light/dark mode, responsive).

## Features

- Chat with the knowledge base of a selected club (`courseId`), with suggested questions
- **Streaming answers** — text appears word by word (Server-Sent Events via `fetch`)
- **Sources** — each answer has a collapsible list of the document chunks it was based on
- **Follow-up questions** — recent messages are sent as history; the UI shows how a follow-up was understood
- Topic tags, clarification badge and response time on every answer
- **Add knowledge** panel with three sources — **Text**, **File** (drag & drop PDF / Word / TXT, with a file card) and **Link** (add up to 5 web pages, paste several at once, live per-page import progress); topic chips; asks for an admin key only if the server requires one
- Backend online/offline indicator; friendly messages for rate limits (429) and missing admin key (401)
- **How it works** page (`#/about`): plain-language explanation, the backend's endpoints, links to Swagger / OpenAPI / source, and a live API call showing the raw request and response

## Run locally

Start the backend first (from the repo root: `npm run start:dev`, port 3000), then:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In development, Vite proxies `/ask`, `/kb`, `/rules` and `/health` to the backend, so no CORS setup is needed. To point the proxy elsewhere, set `VITE_PROXY_TARGET` (e.g. `http://localhost:3001`).

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend URL in production (empty in development and in Docker) |
| `VITE_ENABLE_INGEST` | `false` hides the "Add knowledge" panel (read-only public demo) |
| `VITE_DEFAULT_COURSE_ID` | Club selected on load (default `demo-club`) |

## Scripts

```bash
npm run dev      # dev server with API proxy
npm test         # Vitest unit tests
npm run lint     # oxlint
npm run build    # type-check + production build to dist/
```

The production build is a static site for Vercel, Netlify or any static host. When it runs on a different domain from the backend, set `CORS_ORIGIN` on the backend to the frontend's URL. In Docker, [`nginx.conf`](nginx.conf) serves the site and proxies API calls (with buffering off for streaming).

## Structure

```
src/
├── api.ts             → API client: ask, askStream (SSE), add text, upload file, courses, health
├── sse.ts             → Server-Sent Events parser for fetch streams (+ sse.test.ts)
├── App.tsx            → layout, header, tabs (hash routing), club picker, chat state + history
├── About.tsx          → "How it works" page with live API demo
├── Chat.tsx           → messages, streaming bubble, sources, suggestions, composer
├── KnowledgePanel.tsx → "Add knowledge" panel: source tabs, topic chips, admin key, link-job polling
├── FileDropzone.tsx   → drag-and-drop file picker + file card
├── LinkImport.tsx     → URL list and live import progress
├── icons.tsx          → small inline SVG icons
└── index.css          → styles (design tokens, dark mode, responsive)
```
