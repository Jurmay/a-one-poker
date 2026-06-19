// Vercel Serverless Function
// POST /api/coach
// Body: { handContext: {...} }
// Returns: { grade, summary, reasoning, gtoNote }

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

  const systemPrompt = `You are a professional poker coach analyzing a Texas Hold'em decision in real time.
You will be given the hero's hole cards, the board, pot size, stack sizes, betting action, and the action the hero just took.
You may also be given a "prior recommendation" — advice that was shown to the hero BEFORE they acted in this exact spot. If present, explicitly note whether the hero followed it or deviated, and factor that into your grade.

Respond ONLY with valid JSON (no markdown, no preamble, no code fences) matching exactly this shape:
{
  "grade": "Excellent" | "Good" | "Marginal" | "Mistake" | "Major Mistake",
  "summary": "one short sentence, max 14 words, plain language",
  "reasoning": "2-3 sentences explaining the GTO/exploitative reasoning behind the grade, mentioning pot odds, equity, or range considerations where relevant. If a prior recommendation was given, mention whether hero followed or deviated from it.",
  "gtoNote": "one sentence on what the theoretically optimal play would be in this exact spot, even if it matches what hero did"
}

Be direct and precise. Do not hedge unnecessarily. Use real poker terminology (SPR, pot odds, range, equity, polarized, blockers) but stay concise. Calibrate grading honestly — most reasonable plays are "Good", reserve "Excellent" for clearly optimal high-value plays, and "Major Mistake" for clear blunders like folding to a free check.`;

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
        max_tokens: 400,
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
        grade: 'Good',
        summary: 'Analysis unavailable — parsing error.',
        reasoning: cleaned.slice(0, 300),
        gtoNote: '',
      };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}

function buildUserPrompt(ctx) {
  const {
    heroHoleCards, communityCards, phase, pot, potBeforeAction,
    heroStackBefore, heroStackAfter, currentBetBeforeAction,
    callAmount, action, actionAmount, numPlayersInHand, position,
  } = ctx;

  const cardsStr = (cards) => (cards || []).map(c => `${c.r}${c.s}`).join(' ') || 'none';

  let priorLine = '';
  if (ctx.priorRecommendation) {
    priorLine = `\nPrior recommendation shown to hero before acting: ${ctx.priorRecommendation}${ctx.priorSizing ? ` (${ctx.priorSizing})` : ''}`;
  }

  return `Street: ${phase}
Hero hole cards: ${cardsStr(heroHoleCards)}
Board: ${cardsStr(communityCards)}
Pot before hero's action: ${potBeforeAction}
Amount hero needed to call: ${callAmount}
Hero's stack before action: ${heroStackBefore}
Players still in the hand: ${numPlayersInHand}
Hero's position context: ${position || 'unspecified'}${priorLine}

Hero's action: ${action}${actionAmount ? ` (amount: ${actionAmount})` : ''}
Pot after action: ${pot}

Grade this decision and respond with the required JSON only.`;
}
