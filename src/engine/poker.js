// ─── Re-exports ───────────────────────────────────────────────────────────────
// Hand evaluation lives in handEval.js (separate module to avoid a circular
// import between this file and equity.js, which also needs bestHand()).
// Re-exported here so nothing elsewhere in the app needs to change its imports.
import { bestHand, RANKS as _RANKS, SUITS as _SUITS } from './handEval';
import { estimateEquity, requiredEquityToCall, analyzeBoardTexture } from './equity';
import { classifyPreflopHand, PREFLOP_TIER_LABELS } from './preflopRanges';

export { RANKS, SUITS, SUIT_COLOR, HAND_NAMES, rankIdx, bestHand } from './handEval';

// ─── Deck ────────────────────────────────────────────────────────────────────

export function freshDeck() {
  const d = [];
  for (const r of _RANKS) for (const s of _SUITS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ─── Game State Factory ───────────────────────────────────────────────────────
export function createPlayer(id, name, stack, isHero = false, isAI = true, isOpen = false) {
  return {
    id, name, stack, isHero, isAI,
    isOpen, // true = unclaimed seat, currently AI-controlled until a human joins via the seat-join screen
    holeCards: [], currentBet: 0, status: 'waiting', // waiting|active|folded|allin
    // Permanent, cumulative stats — only updated ONCE per hand at hand-end,
    // never incremented mid-hand, to avoid double-counting across streets.
    stats: {
      handsPlayed: 0,
      vpipCount: 0, pfrCount: 0, threeBetCount: 0,
      wtsdCount: 0, wonAtShowdownCount: 0,
      totalInvested: 0, totalWon: 0,
    },
    // Per-hand transient flags — reset at the start of every hand, read once
    // at hand-end to update the permanent stats above. Not meant to be
    // displayed directly; _prefixed to signal "internal, this-hand-only".
    _hand: { vpip: false, pfr: false, threeBet: false, investedThisHand: 0, sawShowdown: false },
  };
}

export function createGameState(config) {
  return {
    config,
    players: [],
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    minRaise: config.bb,
    phase: 'idle',          // idle|preflop|flop|turn|river|showdown
    actingIdx: -1,
    lastAggressorIdx: -1,
    dealerIdx: 0,
    handNum: 0,
    log: [],
    sessionStats: { handsPlayed: 0, heroNet: 0, heroWins: 0, heroVPIPCount: 0 }
  };
}

// ─── Villain AI ───────────────────────────────────────────────────────────────
export function villainDecision(player, gameState) {
  const { currentBet, pot, communityCards } = gameState;
  const callAmt = currentBet - player.currentBet;
  const rand = Math.random();

  // Estimate hand strength for non-zero community
  let strength = 0.5;
  if (communityCards.length > 0 && player.holeCards.length === 2) {
    const ev = bestHand([...player.holeCards, ...communityCards]);
    strength = ev.score / (9 * 1e8); // normalize 0-1
  }

  if (callAmt === 0) {
    // Check or bet
    if (rand < 0.45 + strength * 0.2) return { action: 'check' };
    const betSz = Math.floor(pot * (0.4 + Math.random() * 0.5));
    return { action: 'bet', amount: Math.min(betSz, player.stack) };
  }

  const potOdds = pot > 0 ? callAmt / (pot + callAmt) : 1;

  // Fold if pot odds too bad and hand weak
  if (strength < potOdds * 0.8 && rand < 0.55) return { action: 'fold' };

  // Sometimes raise/reraise
  if (strength > 0.6 && rand < 0.35) {
    const raiseTo = currentBet * (1.5 + Math.random()) + Math.floor(pot * 0.4);
    return { action: 'raise', amount: Math.min(Math.floor(raiseTo), player.stack + player.currentBet) };
  }
  if (strength > 0.85 && rand < 0.25) return { action: 'allin' };

  return { action: 'call' };
}

// ─── GTO-Style Offline Coach ──────────────────────────────────────────────────
// This replaces pure "pot odds only" grading with an actual decision framework:
// preflop hand strength is judged against position-aware opening ranges;
// postflop decisions are judged by comparing simulated equity (Monte Carlo,
// see equity.js) against the pot odds required to call, with board texture
// shaping bet-sizing guidance. This is the fallback used whenever the Claude
// API is unavailable (no credit, no internet, rate limited) — see claudeCoach.js.

export function ruleBasedCoach(action, hero, gameState) {
  const { phase, players } = gameState;
  const callAmt = Math.max(0, gameState.currentBet - hero.currentBet);
  const potOdds = requiredEquityToCall(gameState.pot, callAmt);
  const spr = hero.stack > 0 && gameState.pot > 0 ? (hero.stack / gameState.pot).toFixed(1) : '∞';
  const numOpponents = Math.max(1, (players?.filter(p => p.status !== 'folded').length || 2) - 1);

  if (phase === 'preflop') {
    return gradePreflop(action, hero, gameState, callAmt, potOdds, spr);
  }
  return gradePostflop(action, hero, gameState, callAmt, potOdds, spr, numOpponents);
}

// ─── Pre-Action Advice (offline) ──────────────────────────────────────────────
// Unlike ruleBasedCoach (which grades a decision already made), this produces
// an actual recommendation BEFORE Hero acts, using the same equity engine and
// preflop range logic. This is what the offline fallback uses when the
// Claude-powered /api/advice call fails (no credit, no internet, etc.) — see
// claudeCoach.js getPreActionAdvice().
export function ruleBasedAdvice(hero, gameState) {
  const { phase, players } = gameState;
  const callAmt = Math.max(0, gameState.currentBet - hero.currentBet);
  const potOdds = requiredEquityToCall(gameState.pot, callAmt);
  const numOpponents = Math.max(1, (players?.filter(p => p.status !== 'folded').length || 2) - 1);

  if (phase === 'preflop') {
    return advisePreflop(hero, gameState, callAmt);
  }
  return advisePostflop(hero, gameState, callAmt, potOdds, numOpponents);
}

function advisePreflop(hero, gameState, callAmt) {
  const position = describeHeroPosition(gameState, hero);
  const { notation, tier, isOpeningHand, threshold } = classifyPreflopHand(hero.holeCards, position);
  const tierLabel = PREFLOP_TIER_LABELS[tier];
  const facingRaise = callAmt > gameState.config.bb;
  const canCheck = callAmt === 0;

  if (isOpeningHand) {
    if (facingRaise && tier > 2) {
      // Strong-ish but not premium, facing a raise — call rather than 3-bet
      return {
        recommendation: 'Call',
        sizing: '',
        reasoning: `${notation} (${tierLabel}) is good enough to continue against a raise from ${position}, but not strong enough to typically 3-bet here.`,
      };
    }
    return {
      recommendation: canCheck ? 'Check' : (facingRaise ? 'Call' : 'Raise'),
      sizing: facingRaise ? '' : '2.5-3x BB',
      reasoning: `${notation} (${tierLabel}) is a standard opening hand from ${position}. Raising builds the pot with a range advantage.`,
    };
  } else if (tier === threshold + 1 && !facingRaise) {
    return {
      recommendation: canCheck ? 'Check' : 'Fold',
      sizing: '',
      reasoning: `${notation} (${tierLabel}) is just below the typical opening range for ${position}. A steal-raise can work, but folding or checking is the standard line.`,
    };
  } else {
    return {
      recommendation: canCheck ? 'Check' : 'Fold',
      sizing: '',
      reasoning: `${notation} (${tierLabel}) is below the opening threshold for ${position} (needs Tier ${threshold} or better). Standard play is to fold here and wait for a better spot.`,
    };
  }
}

function advisePostflop(hero, gameState, callAmt, potOdds, numOpponents) {
  const board = gameState.communityCards || [];
  const eq = estimateEquity(hero.holeCards, board, numOpponents, 1200);
  const texture = analyzeBoardTexture(board);
  const canCheck = callAmt === 0;
  const equityEdge = round1(eq.equity - potOdds);

  if (canCheck) {
    if (eq.equity >= 60) {
      return {
        recommendation: 'Bet',
        sizing: texture.texture.includes('wet') ? '2/3 pot' : '1/2 pot',
        reasoning: `Strong equity (${eq.equity}%) on a ${texture.texture} board. Betting builds the pot for value and charges opponents drawing behind.`,
      };
    } else if (eq.equity >= 40) {
      return {
        recommendation: 'Check',
        sizing: '',
        reasoning: `Moderate equity (${eq.equity}%). ${texture.description} Checking controls the pot size and avoids bloating it with a marginal hand.`,
      };
    } else {
      return {
        recommendation: 'Check',
        sizing: '',
        reasoning: `Lower equity (${eq.equity}%). Checking is the default here — betting would need to rely heavily on fold equity rather than hand strength.`,
      };
    }
  } else {
    if (equityEdge >= 15 && eq.equity >= 55) {
      return {
        recommendation: 'Raise',
        sizing: '2.5-3x the bet',
        reasoning: `Strong equity (${eq.equity}%) well above the ${potOdds}% required. Raising extracts more value and denies equity to drawing hands.`,
      };
    } else if (equityEdge >= 0) {
      return {
        recommendation: 'Call',
        sizing: '',
        reasoning: `Equity (${eq.equity}%) covers the ${potOdds}% required to call (+${equityEdge}pt edge). ${texture.description}`,
      };
    } else if (equityEdge >= -8) {
      return {
        recommendation: 'Call',
        sizing: '',
        reasoning: `Equity (${eq.equity}%) is close to the ${potOdds}% required — a thin but defensible call, especially with implied odds or position.`,
      };
    } else {
      return {
        recommendation: 'Fold',
        sizing: '',
        reasoning: `Equity (${eq.equity}%) falls short of the ${potOdds}% required to call by ${Math.abs(equityEdge)}pts. ${texture.description} Folding is correct on the math.`,
      };
    }
  }
}

function gradePreflop(action, hero, gameState, callAmt, potOdds, spr) {
  const position = describeHeroPosition(gameState, hero);
  const { notation, tier, isOpeningHand, threshold } = classifyPreflopHand(hero.holeCards, position);
  const tierLabel = PREFLOP_TIER_LABELS[tier];
  const facingRaise = callAmt > gameState.config.bb; // more than just the BB = someone raised

  let grade, explanation;

  if (action === 'fold') {
    if (isOpeningHand && !facingRaise) {
      grade = 'Mistake';
      explanation = `${notation} (${tierLabel}) is an opening hand from ${position} — this range is normally played here, not folded. Folding gives up a hand with good equity.`;
    } else if (tier <= 2 && facingRaise) {
      grade = 'Marginal';
      explanation = `${notation} (${tierLabel}) can often continue against a single raise, especially in position. Folding is reasonable but not always necessary with hands this strong.`;
    } else {
      grade = 'Good';
      explanation = `${notation} (${tierLabel}) is below the opening threshold for ${position} (needs Tier ${threshold} or better). Folding preserves chips for better spots.`;
    }
  } else if (action === 'check' || action === 'call') {
    if (tier >= 4 && facingRaise) {
      grade = 'Marginal';
      explanation = `${notation} (${tierLabel}) facing a raise is a speculative call. SPR ${spr}x. Only continue if you can comfortably see a flop and fold if you miss.`;
    } else if (tier <= 3) {
      grade = 'Good';
      explanation = `${notation} (${tierLabel}) is a reasonable hand to continue with from ${position}. SPR: ${spr}x.`;
    } else {
      grade = 'Good';
      explanation = `Limping in or completing with ${notation} from ${position}. SPR: ${spr}x.`;
    }
  } else if (action === 'raise' || action === 'bet' || action === 'allin') {
    if (isOpeningHand) {
      grade = tier <= 2 ? 'Excellent' : 'Good';
      explanation = `${notation} (${tierLabel}) is a standard raising hand from ${position}. Raising builds the pot with a range advantage and denies equity to weaker hands behind.`;
    } else if (tier === threshold + 1) {
      grade = 'Marginal';
      explanation = `${notation} (${tierLabel}) is slightly below the typical opening range for ${position}. A raise here can work as a positional steal but isn't a standard value raise.`;
    } else {
      grade = 'Mistake';
      explanation = `${notation} (${tierLabel}) is well below the opening range for ${position} (needs Tier ${threshold} or better). This raise relies entirely on fold equity with little hand value behind it.`;
    }
  } else {
    grade = 'Good';
    explanation = `${notation} (${tierLabel}) from ${position}.`;
  }

  return { grade, explanation };
}

function gradePostflop(action, hero, gameState, callAmt, potOdds, spr, numOpponents) {
  const board = gameState.communityCards || [];
  const eq = estimateEquity(hero.holeCards, board, numOpponents, 1200);
  const texture = analyzeBoardTexture(board);
  const equityEdge = round1(eq.equity - potOdds);

  let grade, explanation;

  if (action === 'fold') {
    if (callAmt === 0) {
      grade = 'Major Mistake';
      explanation = 'You folded when you could check for free — this is never correct. Always take the free card when nothing is being asked of you.';
    } else if (eq.equity >= potOdds + 5) {
      grade = 'Mistake';
      explanation = `Your equity (${eq.equity}%) comfortably exceeds the ${potOdds}% needed to call. ${texture.description} Folding here gives up a profitable continue.`;
    } else if (eq.equity >= potOdds) {
      grade = 'Marginal';
      explanation = `Your equity (${eq.equity}%) is close to break-even against the ${potOdds}% required. Folding is defensible but a call wasn't clearly wrong either.`;
    } else {
      grade = 'Good';
      explanation = `Your equity (${eq.equity}%) is below the ${potOdds}% required to call profitably. ${texture.description} Folding is the mathematically correct default here.`;
    }
  } else if (action === 'check') {
    if (texture.texture === 'very wet' && eq.equity > 65) {
      grade = 'Marginal';
      explanation = `Strong equity (${eq.equity}%) on a ${texture.texture} board. Checking risks a free card that lets draws catch up — consider betting for value/protection instead.`;
    } else {
      grade = 'Good';
      explanation = `Checking with ${eq.equity}% equity. ${texture.description} SPR: ${spr}x — reasonable to control the pot here.`;
    }
  } else if (action === 'call') {
    if (equityEdge >= 5) {
      grade = 'Good';
      explanation = `Calling with ${eq.equity}% equity against ${potOdds}% required — a clear profitable call (+${equityEdge}pt edge). ${texture.description}`;
    } else if (equityEdge >= -3) {
      grade = 'Marginal';
      explanation = `Equity (${eq.equity}%) is close to the ${potOdds}% required to call — roughly break-even. Implied odds and position should tip this decision either way.`;
    } else {
      grade = 'Mistake';
      explanation = `Equity (${eq.equity}%) falls short of the ${potOdds}% required to call by ${Math.abs(equityEdge)}pts. ${texture.description} This is a -EV call on the math alone.`;
    }
  } else if (action === 'bet' || action === 'raise') {
    if (eq.equity >= 60) {
      grade = 'Excellent';
      explanation = `Betting with strong equity (${eq.equity}%) on a ${texture.texture} board. This builds the pot for value and charges opponents drawing behind.`;
    } else if (eq.equity >= 40) {
      grade = 'Good';
      explanation = `Betting with ${eq.equity}% equity works as a mix of value and denial. ${texture.description} Sizing should reflect how many draws are live.`;
    } else {
      grade = 'Marginal';
      explanation = `Betting with lower raw equity (${eq.equity}%) relies on fold equity rather than hand strength. ${texture.description} Make sure this fits a bluffing frequency, not just a hopeful bet.`;
    }
  } else if (action === 'allin') {
    if (eq.equity >= 55) {
      grade = 'Good';
      explanation = `All-in with ${eq.equity}% equity (SPR ${spr}x) is a profitable shove on raw numbers. ${texture.description}`;
    } else if (eq.equity >= 40) {
      grade = 'Marginal';
      explanation = `All-in with ${eq.equity}% equity needs meaningful fold equity to be correct, since you're behind on a showdown basis (SPR ${spr}x).`;
    } else {
      grade = 'Mistake';
      explanation = `All-in with only ${eq.equity}% equity is a significant underdog on showdown value alone (SPR ${spr}x). This needs very strong fold equity to break even.`;
    }
  } else {
    grade = 'Good';
    explanation = `${eq.equity}% equity. ${texture.description}`;
  }

  return { grade, explanation, equity: eq.equity, potOdds, texture: texture.texture };
}

function describeHeroPosition(gameState, hero) {
  const idx = gameState.players.findIndex(p => p.isHero);
  const n = gameState.players.length;
  const dealerIdx = gameState.dealerIdx;
  const diff = (idx - dealerIdx + n) % n;
  if (diff === 0) return 'Button (Dealer)';
  if (diff === 1) return 'Small Blind';
  if (diff === 2) return 'Big Blind';
  if (diff === n - 1) return 'Cutoff';
  if (diff <= 3) return 'Early position';
  return 'Middle position';
}

function round1(n) { return Math.round(n * 10) / 10; }

export const GRADE_COLORS = {
  'Excellent':     'text-emerald-400',
  'Good':          'text-sky-400',
  'Marginal':      'text-amber-400',
  'Mistake':       'text-red-400',
  'Major Mistake': 'text-red-600',
};
