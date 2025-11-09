# Postbot Admin UI

This is a minimal React + Vite admin UI to list and inspect render jobs.

Run locally:

```bash
cd admin
npm install
npm run dev
```

The UI will call `/jobs` and `/jobs/:id` on the same host; set `VITE_API_BASE` if your API is hosted elsewhere.
