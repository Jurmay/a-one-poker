import { ruleBasedCoach, ruleBasedAdvice } from '../engine/poker';

// ─── Claude-powered coach ──────────────────────────────────────────────────
// Two calls: getPreActionAdvice (fires automatically when it becomes Hero's
// turn, recommends a play) and getCoaching (fires after Hero acts, grades
// the actual decision — referencing the prior advice if there was one).
// Both call our serverless function which holds the Anthropic key server-side.
// Both fall back to a local rule-based response on any failure, so the app
// never breaks or stalls waiting on the network.

export async function getPreActionAdvice(hero, gameState) {
  const ctx = buildHandContext(null, null, hero, gameState, gameState);

  try {
    const response = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handContext: ctx }),
    });

    if (!response.ok) throw new Error(`Advice API returned ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return {
      recommendation: data.recommendation || 'Check',
      reasoning: data.reasoning || 'No analysis available.',
      sizing: data.sizing || '',
      source: 'claude',
    };
  } catch (err) {
    // Silent fallback — same offline engine used for post-action grading,
    // but producing an actual recommendation instead of a grade.
    const fallback = ruleBasedAdvice(hero, gameState);
    return {
      recommendation: fallback.recommendation,
      reasoning: fallback.reasoning,
      sizing: fallback.sizing || '',
      source: 'fallback',
    };
  }
}

export async function getCoaching(action, amount, hero, gameStateBeforeAction, gameStateAfterAction, priorAdvice = null) {
  const ctx = buildHandContext(action, amount, hero, gameStateBeforeAction, gameStateAfterAction);
  if (priorAdvice?.recommendation) {
    ctx.priorRecommendation = priorAdvice.recommendation;
    ctx.priorSizing = priorAdvice.sizing;
  }

  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handContext: ctx }),
    });

    if (!response.ok) throw new Error(`Coach API returned ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return {
      grade: data.grade || 'Good',
      explanation: data.reasoning || data.summary || 'No analysis available.',
      summary: data.summary || '',
      gtoNote: data.gtoNote || '',
      source: 'claude',
    };
  } catch (err) {
    // Silent fallback — rule-based coach, same shape, marked so UI can show a subtle indicator.
    const fallback = ruleBasedCoach(action, hero, gameStateBeforeAction);
    return {
      grade: fallback.grade,
      explanation: fallback.explanation,
      summary: '',
      gtoNote: '',
      source: 'fallback',
    };
  }
}

function buildHandContext(action, amount, hero, beforeState, afterState) {
  const notFolded = beforeState.players.filter(p => p.status !== 'folded');
  return {
    heroHoleCards: hero.holeCards,
    communityCards: beforeState.communityCards,
    phase: beforeState.phase,
    potBeforeAction: beforeState.pot,
    pot: afterState.pot,
    callAmount: Math.max(0, beforeState.currentBet - hero.currentBet),
    currentBetBeforeAction: beforeState.currentBet,
    heroStackBefore: hero.stack,
    heroStackAfter: afterState.players.find(p => p.isHero)?.stack ?? hero.stack,
    numPlayersInHand: notFolded.length,
    action,
    actionAmount: amount || null,
    position: describePosition(beforeState, hero),
  };
}

function describePosition(state, hero) {
  const idx = state.players.findIndex(p => p.isHero);
  const n = state.players.length;
  const dealerIdx = state.dealerIdx;
  const diff = (idx - dealerIdx + n) % n;
  if (diff === 0) return 'Button (Dealer)';
  if (diff === 1) return 'Small Blind';
  if (diff === 2) return 'Big Blind';
  if (diff === n - 1) return 'Cutoff';
  if (diff <= 3) return 'Early position';
  return 'Middle position';
}
