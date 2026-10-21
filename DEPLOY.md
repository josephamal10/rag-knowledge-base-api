# Deploying the live demo

Backend → **Render** (free web service) · Frontend → **Vercel** (free static hosting).
The public demo is **read-only**: anyone can ask questions; adding or deleting data needs the admin key.

> Plan names, limits and screens on these services change over time — check their current docs if a step looks different.

## 1. Create a fresh Upstash index (don't reuse your development index)

1. [console.upstash.com](https://console.upstash.com) → **Vector** → **Create Index**
2. **Type:** Hybrid · **Dense dimension:** `1536` · **Similarity:** Cosine · **Embedding model:** none
3. Copy the **REST URL** and **REST TOKEN**.

A separate index means the public demo can only ever see the fictional `demo-club` data.

## 2. Gemini API key with a spending limit

1. Create a key in [Google AI Studio](https://aistudio.google.com).
2. If billing is enabled on that Google Cloud project, set a **budget alert / cap** so a busy demo can't run up costs.
   The backend also rate-limits each visitor (`RATE_LIMIT_PER_MINUTE`, default 20 per endpoint).

## 3. Deploy the backend on Render

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint** → connect GitHub and pick this repository.
   Render reads [`render.yaml`](render.yaml).
2. Fill in the secrets it asks for:
   - `GEMINI_API_KEY`
   - `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN` (from step 1)
   - `CORS_ORIGIN` — leave blank for now; you'll set it in step 5
3. Click **Apply**. The first build takes a few minutes. On start it seeds `demo-club` automatically.
4. Open `https://<your-service>.onrender.com/health` → `{"status":"ok"}`, and `/api` for Swagger.
5. Note the generated `ADMIN_API_KEY` (Render → service → **Environment**) — you'll need it to add data.

Free Render services go to sleep when idle, so the first request after a while can take up to a minute.

## 4. Deploy the frontend on Vercel

1. [vercel.com/new](https://vercel.com/new) → import this repository.
2. **Root Directory:** `frontend` (Vercel detects Vite automatically).
3. **Environment variables:**
   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-service>.onrender.com` |
   | `VITE_ENABLE_INGEST` | `false` (hides "Add knowledge" on the public site) |
4. **Deploy**, then copy the site URL (e.g. `https://rag-knowledge-base.vercel.app`).

## 5. Connect them

1. Render → service → **Environment** → set `CORS_ORIGIN` to your Vercel URL → save (it redeploys).
2. Open the Vercel URL, ask "What time is check-in?" and check **How it works → Run POST /ask**.
3. Put the live link at the top of the README and on your portfolio.

## Adding data to the live demo

Write endpoints need the admin key in the `x-admin-key` header, e.g.

```bash
curl -X POST https://<your-service>.onrender.com/kb/text \
  -H "Content-Type: application/json" -H "x-admin-key: <ADMIN_API_KEY>" \
  -d '{"text":"The spa opens at 9 AM.","courseId":"demo-club","category":"lodging-info"}'
```

In Swagger (`/api`) click **Authorize** and paste the key. Only use fictional or public data on the live demo.
