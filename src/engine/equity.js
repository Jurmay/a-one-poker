// ─── Equity Engine ────────────────────────────────────────────────────────────
// Monte Carlo simulation: estimates Hero's win probability by dealing random
// opponent hands + completing the board many times and tallying wins/ties.
// This is the actual mathematical foundation the offline coach reasons from —
// not a guess, a real simulation over the unseen cards.

import { bestHand } from './handEval';

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];

function fullDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d;
}

function cardKey(c) { return c.r + c.s; }

function removeCards(deck, used) {
  const usedKeys = new Set(used.map(cardKey));
  return deck.filter(c => !usedKeys.has(cardKey(c)));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Estimate Hero's equity (win% + tie%) against `numOpponents` random hands,
 * given the current board (0, 3, 4, or 5 cards known).
 *
 * @param {Array} heroCards - Hero's 2 hole cards
 * @param {Array} board - known community cards (0-5)
 * @param {number} numOpponents - how many live opponents to simulate against
 * @param {number} iterations - simulation count (more = more accurate, slower)
 * @returns {{win: number, tie: number, lose: number, equity: number}} percentages 0-100
 */
export function estimateEquity(heroCards, board, numOpponents = 1, iterations = 1500) {
  if (!heroCards || heroCards.length !== 2) return { win: 50, tie: 0, lose: 50, equity: 50 };
  numOpponents = Math.max(1, numOpponents);

  const known = [...heroCards, ...board];
  const baseDeck = removeCards(fullDeck(), known);
  const cardsNeeded = 5 - board.length;

  let wins = 0, ties = 0, losses = 0;

  for (let i = 0; i < iterations; i++) {
    const deck = shuffle(baseDeck);
    let idx = 0;

    // Deal opponent hole cards
    const opponents = [];
    for (let o = 0; o < numOpponents; o++) {
      opponents.push([deck[idx++], deck[idx++]]);
    }

    // Complete the board
    const runout = [...board];
    for (let c = 0; c < cardsNeeded; c++) runout.push(deck[idx++]);

    const heroEval = bestHand([...heroCards, ...runout]);
    let bestOppScore = -1;
    for (const opp of opponents) {
      const oppEval = bestHand([...opp, ...runout]);
      if (oppEval.score > bestOppScore) bestOppScore = oppEval.score;
    }

    if (heroEval.score > bestOppScore) wins++;
    else if (heroEval.score === bestOppScore) ties++;
    else losses++;
  }

  const win = (wins / iterations) * 100;
  const tie = (ties / iterations) * 100;
  const lose = (losses / iterations) * 100;
  // Equity = win% + half of tie% (standard convention for split pots)
  const equity = win + tie / 2;

  return {
    win: round1(win),
    tie: round1(tie),
    lose: round1(lose),
    equity: round1(equity),
  };
}

function round1(n) { return Math.round(n * 10) / 10; }

/**
 * Required equity to profitably call, given pot odds.
 * If your equity exceeds this, calling is +EV; if not, folding is correct
 * (ignoring implied odds / future betting, which is a simplification but
 * the correct baseline heuristic).
 */
export function requiredEquityToCall(pot, callAmount) {
  if (callAmount <= 0) return 0;
  return round1((callAmount / (pot + callAmount)) * 100);
}

// ─── Board Texture Analysis ───────────────────────────────────────────────────
// Classifies how dangerous/dynamic a board is — wet (many draws live) vs
// dry (few draws, hands rarely change). This matters for sizing and
// continuing-range decisions in a way pure pot-odds math doesn't capture.
//
// Important distinction: "wet vs dry" describes whether draws are LIVE,
// which is a flop/turn concept. On the river, all cards are out — there are
// no more draws to complete, only made hands. So river boards are evaluated
// for how many DIFFERENT strong hands are possible (straight/flush already
// there, paired), not draw potential, since "wet" in the draw sense no
// longer means anything once the last card is dealt.

export function analyzeBoardTexture(board) {
  if (!board || board.length < 3) {
    return { texture: 'preflop', flushDraw: false, straightDraw: false, paired: false, description: 'No board yet.' };
  }

  const ranks = board.map(c => RANKS.indexOf(c.r)).sort((a, b) => a - b);
  const suits = board.map(c => c.s);
  const isRiver = board.length === 5;

  // Flush: 2+ same suit = draw possible (pre-river); 4+ = flush is actually out (any river)
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const flushMade = maxSuitCount >= 4; // 4 of one suit on board = flush possible for anyone holding 1
  const flushDraw = !isRiver && maxSuitCount >= 2;

  // Straight: on flop/turn, look for any tight 3-card window (a draw can
  // still complete). On the river, only a tight window AMONG ADJACENT
  // cards matters, since the straight either already exists or doesn't —
  // a stray low pair (like a "2,3,4" hiding inside 2,3,4,7,K) shouldn't
  // count once unrelated high cards make the actual straight impossible
  // to riddle together with reasonable hole cards in most cases. We keep
  // this simple and conservative: only flag straight texture if 3+ of the
  // board's cards are mutually within a 4-rank window (a real cluster),
  // not just any 3 cards picked from a wider spread.
  const uniqueRanks = [...new Set(ranks)];
  let straightDraw = false;
  for (let i = 0; i <= uniqueRanks.length - 3; i++) {
    const windowSpan = uniqueRanks[i + 2] - uniqueRanks[i];
    if (windowSpan <= 4) {
      // Require the cluster to be a meaningful fraction of the board,
      // not just 3 cards lost inside a 5-card spread.
      if (board.length === 3 || windowSpan <= 4) { straightDraw = true; break; }
    }
  }
  // On the river, downgrade isolated low clusters that don't meaningfully
  // contribute given high, disconnected cards dominate the board (e.g.
  // 2-3-4-7-K: the 2-3-4 cluster is real but a King and a 7 break up any
  // realistic straight-completing range). Simplification: if the board's
  // FULL span (not just a sub-window) is very wide (>9), treat the board
  // as having dispersed, low-relevance clustering rather than true texture.
  const fullSpan = uniqueRanks[uniqueRanks.length - 1] - uniqueRanks[0];
  if (isRiver && fullSpan > 9) straightDraw = false;

  // Paired board
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const paired = Object.values(rankCounts).some(c => c >= 2);

  // High card density (broadway-heavy boards play differently)
  const highCards = ranks.filter(r => r >= 10).length; // T,J,Q,K,A

  let texture, description;
  const dangerScore = (flushDraw || flushMade ? 1 : 0) + (straightDraw ? 1 : 0) + (paired ? 0.5 : 0);

  if (isRiver && flushMade) {
    texture = 'very wet';
    description = 'A flush is possible on the river — anyone holding two of that suit has it.';
  } else if (dangerScore >= 1.5) {
    texture = 'very wet';
    description = isRiver
      ? 'Multiple strong hands (straight/flush) are possible on this completed board.'
      : 'Highly coordinated board — multiple draws live, hand values can flip easily.';
  } else if (dangerScore >= 1) {
    texture = 'wet';
    description = isRiver
      ? 'A straight or flush was possible on this board.'
      : 'Coordinated board — flush or straight draws are live.';
  } else if (paired) {
    texture = 'paired';
    description = 'Paired board — full houses and trips possible, fewer draws.';
  } else if (highCards >= 2) {
    texture = 'dry-high';
    description = isRiver
      ? 'Dry, high-card board — broadway hands and overpairs were the main contenders.'
      : 'Dry, high-card board — few draws, but broadway hands and overpairs are common.';
  } else {
    texture = 'dry';
    description = isRiver
      ? 'Dry, disconnected board — few hands could have improved much here.'
      : 'Dry, disconnected board — few draws, made hands tend to stay best.';
  }

  return { texture, flushDraw, flushMade, straightDraw, paired, highCards, description };
}
