// ─── Preflop Range Logic ──────────────────────────────────────────────────────
// Position-aware preflop hand classification. Real preflop strategy depends
// heavily on position (how many players act behind you) and how many players
// are already in the pot — a hand correct to open from the button is often
// wrong from under the gun. This encodes simplified, standard tight-aggressive
// opening ranges by position, used to grade preflop decisions.

const RANK_VALUE = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function handNotation(cards) {
  const [c1, c2] = cards;
  const r1 = RANK_VALUE[c1.r], r2 = RANK_VALUE[c2.r];
  const hi = r1 >= r2 ? c1.r : c2.r;
  const lo = r1 >= r2 ? c2.r : c1.r;
  const suited = c1.s === c2.s;
  const pair = c1.r === c2.r;
  if (pair) return `${c1.r}${c1.r}`;
  return `${hi}${lo}${suited ? 's' : 'o'}`;
}

// Tiers, roughly matching standard tight-aggressive opening charts.
// Tier 1 = premium (open from anywhere), Tier 2 = strong, Tier 3 = speculative/positional,
// Tier 4 = marginal (late position / steal only), Tier 5 = fold preflop in most spots.
const TIER_1 = ['AA','KK','QQ','JJ','AKs','AKo'];
const TIER_2 = ['TT','99','AQs','AQo','AJs','KQs','ATs','KJs'];
const TIER_3 = ['88','77','AJo','KQo','ATo','KTs','QJs','QTs','JTs','A9s','A8s','KJo'];
const TIER_4 = ['66','55','44','33','22','A9o','A8o','A7s','A6s','A5s','K9s','Q9s','J9s','T9s','98s','87s','76s','65s','54s','KTo','QJo','JTo'];
// Everything else: Tier 5 (fold in early/middle position, marginal steal-only in late)

function classifyTier(notation) {
  if (TIER_1.includes(notation)) return 1;
  if (TIER_2.includes(notation)) return 2;
  if (TIER_3.includes(notation)) return 3;
  if (TIER_4.includes(notation)) return 4;
  return 5;
}

// How many tiers are "openable" by position. Earlier position = need a
// stronger hand, since more players can still act behind you.
const POSITION_THRESHOLD = {
  'Early position': 2,      // only Tier 1-2
  'Middle position': 3,     // Tier 1-3
  'Cutoff': 4,               // Tier 1-4
  'Button (Dealer)': 4,      // Tier 1-4 (steal range can go wider but keep simple)
  'Small Blind': 3,
  'Big Blind': 5,            // BB can defend wide given pot odds already invested
};

/**
 * Classify a preflop hand given hole cards and position context.
 * Returns tier (1=best, 5=weakest), notation (e.g. "AKs"), and whether
 * it's considered an opening hand from that position.
 */
export function classifyPreflopHand(holeCards, position) {
  const notation = handNotation(holeCards);
  const tier = classifyTier(notation);
  const threshold = POSITION_THRESHOLD[position] || 3;
  const isOpeningHand = tier <= threshold;
  return { notation, tier, isOpeningHand, threshold };
}

export const PREFLOP_TIER_LABELS = {
  1: 'Premium',
  2: 'Strong',
  3: 'Speculative',
  4: 'Marginal',
  5: 'Weak',
};
