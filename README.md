# Steamhub

Tool hub for FRC team 1577 Steampunk. See [PLAN.md](PLAN.md) for what it is and where it's going.

## Run it

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. Data lives in the `steamhub-2027` Supabase project. The URL and publishable key are in `.env`.

## Stack

- Vite, React, TypeScript, React Router
- Supabase: Postgres, Google sign-in, photo storage, realtime
- Design: ttm-design tokens in `src/styles`, with Night Machine for big titles, Newsreader for section titles and Instrument Sans for text
