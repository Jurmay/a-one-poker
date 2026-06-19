// Vercel Serverless Function
// POST /api/advice
// Body: { handContext: {...} }
// Returns: { recommendation, sizing, reasoning }
//
// Fires automatically the moment it becomes Hero's turn (see useGameState.js).
// Unlike /api/coach.js (which grades a decision already made), this one
// recommends what to do BEFORE Hero acts.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  const { handContext } = req.body || {};
  if (!handContext) {
    return res.status(400).json({ error: 'Missing handContext' });
  }

  const systemPrompt = `You are a professional poker coach advising a player BEFORE they act in a live Texas Hold'em hand.
You will be given the hero's hole cards, the board, pot size, stack sizes, and the betting action so far on this street.

Respond ONLY with valid JSON (no markdown, no preamble, no code fences) matching exactly this shape:
{
  "recommendation": "Fold" | "Check" | "Call" | "Bet" | "Raise" | "All-in",
  "sizing": "if Bet/Raise, a specific suggested amount or pot-percentage (e.g. '2/3 pot' or '450'); empty string otherwise",
  "reasoning": "2-3 sentences explaining WHY this is the recommended play — covering pot odds, equity, range considerations, or position as relevant"
}

Be direct and decisive — give one clear recommendation, not a hedge between two options. Use real poker terminology (SPR, pot odds, range, equity, polarized, blockers, fold equity) but stay concise enough to read in a few seconds at the table.`;

  const userPrompt = buildUserPrompt(handContext);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Claude API error', detail: errText });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(c => c.type === 'text');
    const raw = textBlock?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = {
        recommendation: null,
        sizing: '',
        reasoning: cleaned.slice(0, 300) || 'Analysis unavailable — parsing error.',
      };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
};

function buildUserPrompt(ctx) {
  const cardsStr = (cards) => (cards || []).map(c => `${c.r}${c.s}`).join(' ') || 'none';

  return `Street: ${ctx.phase}
Hero hole cards: ${cardsStr(ctx.heroHoleCards)}
Board: ${cardsStr(ctx.communityCards)}
Pot right now: ${ctx.potBeforeAction}
Amount hero needs to call: ${ctx.callAmount}
Hero's stack: ${ctx.heroStackBefore}
Players still in the hand: ${ctx.numPlayersInHand}
Hero's position: ${ctx.position || 'unspecified'}

It is hero's turn to act. Recommend the play and respond with the required JSON only.`;
}
