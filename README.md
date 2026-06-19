# A-One Poker — Training Suite

Texas Hold'em coaching and training web app.
Stack: React · Tailwind · Supabase · Claude API · Vercel

---

## Quick Start (local, full stack)

```bash
npm install
cp .env.example .env.local        # fill in keys (see below)
npm run dev                       # runs React app + local coach API together
```

This starts:
- React dev server on `http://localhost:3000`
- Local Claude coach API on `http://localhost:3001` (proxied automatically via `/api/coach`)

To run them separately: `npm start` (web) and `npm run dev:server` (API) in two terminals.

The app works without any keys too — Supabase falls back to local-only state,
and the AI Coach falls back to a built-in rule-based coach if the Claude API
is unreachable or unconfigured. Nothing ever breaks the game flow.

---

## Environment Variables

| Variable | Where it's used | Safe to expose? |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | Frontend | Yes (protected by RLS) |
| `REACT_APP_SUPABASE_ANON_KEY` | Frontend | Yes (protected by RLS) |
| `ANTHROPIC_API_KEY` | **Server only** — `api/coach.js` | **No — never prefix with `REACT_APP_`** |

The Claude key is deliberately kept out of the React bundle. It lives in a
serverless function (`api/coach.js` on Vercel, `api/devServer.js` locally) so
it's never visible in browser devtools.

---

## Supabase Setup

1. Create free project at https://supabase.com
2. SQL Editor → run `supabase_schema.sql`
3. Project Settings → API → copy URL + anon key into `.env.local`

Real-time sync lets villain screens on separate browser tabs/devices update live.

---

## Vercel Deploy

```bash
npm i -g vercel
vercel --prod
```

In Vercel dashboard → Settings → Environment Variables, add all three vars above.
`api/coach.js` is auto-detected as a serverless function — no extra config needed.

---

## How the AI Coach Works (Stage 3)

After every Hero action, the app sends the hand context (hole cards, board,
pot, stacks, position, action taken) to `/api/coach`, which calls Claude
Sonnet with a poker-coaching system prompt. Claude returns:

- **grade** — Excellent / Good / Marginal / Mistake / Major Mistake
- **summary** — one-line verdict
- **reasoning** — 2-3 sentences of GTO/exploitative analysis
- **gtoNote** — what theory says the optimal play is in that exact spot

A green dot on the coach panel means it's live Claude analysis; a hollow dot
means it silently fell back to the offline rule-based coach (e.g. no internet,
key not set, or rate limited) — the game never stalls waiting on the network.

---

## Project Structure

```
api/
  coach.js          Vercel serverless function — calls Claude, holds the API key
  devServer.js       Local Express mirror of coach.js for `npm run dev`
src/
  engine/poker.js        Deck, hand eval, villain AI, offline rule-based coach (fallback)
  lib/claudeCoach.js      Frontend client — calls /api/coach, falls back on failure
  lib/supabase.js         Supabase client
  hooks/useGameState.js   Central game logic + Supabase sync + async coaching
  components/             Card, PlayerSeat, PokerTable, HeroConsole, Sidebar, SetupModal
  App.js                  Root
```

## Stages

| Stage | Status | What |
|-------|--------|------|
| 1 | ✅ | Core engine prototype |
| 2 | ✅ | React + Tailwind + Supabase full UI |
| 3 | ✅ | Claude API real GTO coaching (server-side key, graceful fallback) |
| 4 | Next | Hand history DB, VPIP/PFR/3-bet stats, villain profiling |
| 5 | — | CSV export, session save/load |
