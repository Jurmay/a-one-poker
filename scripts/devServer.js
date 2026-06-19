// Local dev server — mirrors api/coach.js and api/advice.js so
// `npm run dev:server` works alongside `npm start` without needing
// `vercel dev`. Lives in /scripts (not /api) so Vercel doesn't try to
// deploy this long-running Express server as a serverless function — only
// the actual handler files in /api are deployed there.
// In production on Vercel, api/coach.js and api/advice.js are used directly.

const path = require('path');
const express = require('express');
const cors = require('cors');
const coachHandler = require(path.join(__dirname, '..', 'api', 'coach.js'));
const adviceHandler = require(path.join(__dirname, '..', 'api', 'advice.js'));

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/coach', async (req, res) => {
  try {
    await coachHandler(req, res);
  } catch (err) {
    console.error('[/api/coach] handler threw:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Handler crashed', detail: String(err) });
  }
});

app.post('/api/advice', async (req, res) => {
  try {
    await adviceHandler(req, res);
  } catch (err) {
    console.error('[/api/advice] handler threw:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Handler crashed', detail: String(err) });
  }
});

const PORT = process.env.DEV_API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Local /api/coach dev server running on http://localhost:${PORT}`);
});
