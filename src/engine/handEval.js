// ─── Hand Evaluation ─────────────────────────────────────────────────────────
// Extracted into its own module (separate from poker.js) so that both
// poker.js and equity.js can import it without creating a circular
// dependency between each other.

export const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
export const SUITS = ['♠','♥','♦','♣'];
export const SUIT_COLOR = { '♠':'black','♣':'black','♥':'red','♦':'red' };

export const HAND_NAMES = [
  'High Card','One Pair','Two Pair','Three of a Kind',
  'Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'
];

export function rankIdx(r) { return RANKS.indexOf(r); }

function choose5(cards) {
  const res = [];
  function go(start, cur) {
    if (cur.length === 5) { res.push([...cur]); return; }
    for (let i = start; i < cards.length; i++) { cur.push(cards[i]); go(i + 1, cur); cur.pop(); }
  }
  go(0, []);
  return res;
}

function checkStraight(sorted) {
  const u = [...new Set(sorted)];
  if (u.length < 5) return { is: false };
  if (u[0] - u[4] === 4) return { is: true, high: u[0] };
  // Wheel: A-2-3-4-5
  if (u[0] === 12 && u[1] === 3 && u[2] === 2 && u[3] === 1 && u[4] === 0)
    return { is: true, high: 3 };
  return { is: false };
}

function eval5(cards) {
  const ranks = cards.map(c => rankIdx(c.r)).sort((a, b) => b - a);
  const suits = cards.map(c => c.s);
  const isFlush = suits.every(s => s === suits[0]);
  const straight = checkStraight(ranks);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const vals = Object.values(counts).sort((a, b) => b - a);
  const keyRanks = Object.keys(counts).map(Number)
    .sort((a, b) => counts[b] - counts[a] || b - a);

  let score, name;
  if (isFlush && straight.is) {
    score = straight.high === 12 ? 9 : 8;
    name = score === 9 ? 'Royal Flush' : 'Straight Flush';
    return { score: score * 1e8 + straight.high, name, keyRanks };
  }
  if (vals[0] === 4)                       { score = 7; name = 'Four of a Kind'; }
  else if (vals[0] === 3 && vals[1] === 2) { score = 6; name = 'Full House'; }
  else if (isFlush)                        { score = 5; name = 'Flush'; }
  else if (straight.is)                    {
    return { score: 4 * 1e8 + straight.high, name: 'Straight', keyRanks };
  }
  else if (vals[0] === 3)                  { score = 3; name = 'Three of a Kind'; }
  else if (vals[0] === 2 && vals[1] === 2) { score = 2; name = 'Two Pair'; }
  else if (vals[0] === 2)                  { score = 1; name = 'One Pair'; }
  else                                     { score = 0; name = 'High Card'; }

  let tie = 0;
  for (let i = 0; i < Math.min(keyRanks.length, 5); i++) tie += keyRanks[i] * Math.pow(15, 4 - i);
  return { score: score * 1e8 + tie, name, keyRanks };
}

export function bestHand(cards) {
  if (cards.length < 5) return { score: 0, name: 'High Card', keyRanks: [] };
  let best = { score: -1 };
  for (const combo of choose5(cards)) {
    const e = eval5(combo);
    if (e.score > best.score) best = { ...e, cards: combo };
  }
  return best;
}
