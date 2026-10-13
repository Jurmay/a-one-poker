import { ruleBasedCoach, ruleBasedAdvice } from '../engine/poker';

// ─── Claude-powered coach ──────────────────────────────────────────────────
// Two calls: getPreActionAdvice (fires automatically when it becomes Hero's
// turn, recommends a play) and getCoaching (fires after Hero acts, grades
// the actual decision — referencing the prior advice if there was one).
// Both call our serverless function which holds the Anthropic key server-side.
// Both fall back to a local rule-based response on any failure, so the app
// never breaks or stalls waiting on the network.

export async function getPreActionAdvice(hero, gameState) {
  const ctx = buildAdviceContext(hero, gameState);

  try {
    const response = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handContext: ctx }),
    });

    if (!response.ok) throw new Error(`Advice API returned ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const decision = resolveDecision(data.strategy, data.amount, data.sizing, ctx, gameState);
    return {
      ...decision,
      sizing: data.sizing || '',
      reasoning: data.reasoning || 'No analysis available.',
      source: 'claude',
    };
  } catch (err) {
    // Silent fallback — same offline engine used for post-action grading,
    // but producing an actual recommendation instead of a grade.
    const fallback = ruleBasedAdvice(hero, gameState);
    const key = ACTION_KEYS[fallback.recommendation] || 'check';
    const decision = resolveDecision({ [key]: 1 }, 0, fallback.sizing, ctx, gameState);
    return {
      ...decision,
      sizing: fallback.sizing || '',
      reasoning: fallback.reasoning,
      source: 'fallback',
    };
  }
}

// ─── Turning a strategy into one concrete, legal action ───────────────────────
// The advisor returns a mixed strategy (e.g. raise 60% / call 40%) for close
// spots. The random pick happens HERE, not in the model: language models are
// poor at being random and would pick the same branch almost every time.

const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
const ACTION_LABELS = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
const ACTION_KEYS = { Fold: 'fold', Check: 'check', Call: 'call', Bet: 'bet', Raise: 'raise', 'All-in': 'allin' };

// Maps an action that isn't legal right now onto the closest one that is.
function legalize(action, legal) {
  const { canCheck, canRaise } = legal;
  if (action === 'fold' && canCheck) return 'check';       // never fold for free
  if (action === 'check' && !canCheck) return 'fold';
  if (action === 'call' && canCheck) return 'check';
  if (action === 'bet' && !canCheck) action = 'raise';
  if (action === 'raise' && canCheck) action = 'bet';
  if ((action === 'bet' || action === 'raise') && !canRaise) return 'allin';
  return action;
}

export function resolveDecision(strategy, amount, sizing, ctx, gameState, rand = Math.random) {
  const legal = ctx.legal;

  // Merge frequencies onto legal actions and normalize to 1.
  const mix = {};
  for (const a of ACTIONS) {
    const f = Number(strategy?.[a]);
    if (!(f > 0)) continue;
    const target = legalize(a, legal);
    mix[target] = (mix[target] || 0) + f;
  }
  const total = Object.values(mix).reduce((x, y) => x + y, 0);
  if (!(total > 0)) mix[legal.canCheck ? 'check' : 'fold'] = 1;
  const norm = total > 0 ? total : 1;
  const ordered = Object.entries(mix)
    .map(([a, f]) => [a, f / norm])
    .sort((x, y) => y[1] - x[1]);

  let r = rand();
  let action = ordered[0][0];
  for (const [a, f] of ordered) {
    if (r < f) { action = a; break; }
    r -= f;
  }

  let betTo = 0;
  if (action === 'bet' || action === 'raise') {
    betTo = Math.round(Number(amount) || parseSizing(sizing, ctx, gameState));
    betTo = Math.max(legal.minRaiseTo, betTo);
    if (betTo >= legal.maxBetTo) { action = 'allin'; betTo = 0; }
  }

  return {
    action,
    amount: betTo,
    recommendation: ACTION_LABELS[action],
    strategy: Object.fromEntries(ordered.map(([a, f]) => [ACTION_LABELS[a], Math.round(f * 100)])),
  };
}

// Turns a human sizing hint ("2/3 pot", "2.5-3x BB", "450") into a bet-to amount.
function parseSizing(sizing, ctx, gameState) {
  const text = String(sizing || '').toLowerCase();
  const pot = gameState.pot || 0;
  const bb = gameState.config?.bb || 0;
  const frac = text.match(/(\d+)\s*\/\s*(\d+)\s*pot/);
  if (frac) return gameState.currentBet + (pot * Number(frac[1])) / Number(frac[2]);
  const pct = text.match(/(\d+)\s*%\s*pot/);
  if (pct) return gameState.currentBet + (pot * Number(pct[1])) / 100;
  if (/\bpot\b/.test(text) && !/\d/.test(text)) return gameState.currentBet + pot;
  const bbMult = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?x\s*(?:bb|big blind)/);
  if (bbMult) return Number(bbMult[1]) * bb;
  const num = text.match(/^\s*(\d+)\s*$/);
  if (num) return Number(num[1]);
  // Default: open to 3x preflop, or 2/3 pot after the flop.
  if (gameState.phase === 'preflop') return Math.max(3 * gameState.currentBet, 3 * bb);
  return gameState.currentBet + (2 * pot) / 3;
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
    position: describePosition(beforeState, beforeState.players.findIndex(p => p.isHero)),
  };
}

// Pre-action advice gets the full picture: this hand's action so far, plus a
// read on every opponent (session stats and hands they've shown down).
// Privacy rule: the ONLY hole cards included are Hero's own and cards that
// were actually revealed at a showdown. Never send gameState.players[].holeCards
// for anyone else, and never the deck.
const SHOWDOWNS_PER_OPPONENT = 3;

function buildAdviceContext(hero, gameState) {
  const heroIdx = gameState.players.findIndex(p => p.isHero);
  const callAmount = Math.max(0, gameState.currentBet - hero.currentBet);
  const minRaiseTo = (gameState.minRaise || 0) + gameState.currentBet;
  const maxBetTo = hero.stack + (hero.currentBet || 0);
  const history = gameState.showdownHistory || [];

  return {
    ...buildHandContext(null, null, hero, gameState, gameState),
    heroSeat: heroIdx + 1,
    heroCurrentBet: hero.currentBet || 0,
    bigBlind: gameState.config?.bb || 0,
    legal: {
      canCheck: callAmount === 0,
      canRaise: maxBetTo > minRaiseTo,
      minRaiseTo,
      maxBetTo,
    },
    handActions: (gameState.handActions || []).map(a => ({
      street: a.street, seat: a.seat + 1, name: a.name, action: a.action, amount: a.amount,
    })),
    opponents: gameState.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.isHero)
      .map(({ p, i }) => ({
        seat: i + 1,
        name: p.name,
        position: describePosition(gameState, i),
        stack: p.stack,
        currentBet: p.currentBet || 0,
        status: p.status,
        isHuman: !p.isAI,
        stats: summarizeStats(p.stats),
        recentShowdowns: history
          .filter(h => h.playerId === p.id)
          .slice(-SHOWDOWNS_PER_OPPONENT)
          .map(h => ({
            handNum: h.handNum, holeCards: h.holeCards, board: h.board,
            handName: h.handName, won: h.won, actions: h.actions,
          })),
      })),
  };
}

function pct(n, d) {
  return d > 0 ? Math.round(((n || 0) / d) * 100) : null;
}

function summarizeStats(s = {}) {
  const hands = s.handsPlayed || 0;
  const calls = s.postflopCallCount || 0;
  const aggressive = s.postflopAggressiveCount || 0;
  return {
    hands,
    vpip: pct(s.vpipCount, hands),
    pfr: pct(s.pfrCount, hands),
    threeBet: pct(s.threeBetCount, hands),
    wtsd: pct(s.wtsdCount, hands),
    wonAtShowdown: pct(s.wonAtShowdownCount, s.wtsdCount),
    foldToPostflopBet: pct(s.foldedToPostflopBetCount, s.facedPostflopBetCount),
    facedPostflopBets: s.facedPostflopBetCount || 0,
    aggressionFactor: calls > 0 ? Math.round((aggressive / calls) * 10) / 10 : (aggressive > 0 ? null : 0),
    postflopActions: calls + aggressive,
  };
}

function describePosition(state, idx) {
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
