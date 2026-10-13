import { useState, useEffect, useCallback, useRef } from 'react';
import {
  freshDeck, bestHand, villainDecision,
  createPlayer, createGameState, freshHandFlags
} from '../engine/poker';
import { createTable, updateTable, subscribeToTable, saveHandHistory, getTable } from '../lib/supabase';
import { getCoaching, getPreActionAdvice } from '../lib/claudeCoach';

// How many revealed showdown hands to keep in game state for opponent reads.
const SHOWDOWN_HISTORY_LIMIT = 40;
// Pause before an auto-played hero action, so humans at the table can follow it.
const AUTO_PLAY_DELAY_MS = 900;

// Identifies one hero decision point (hand + street + seat + bet state).
export function turnFingerprint(state) {
  return `${state.handNum}:${state.phase}:${state.actingIdx}:${state.pot}:${state.currentBet}`;
}

const LOCAL_MODE = !process.env.REACT_APP_SUPABASE_URL;

export function useGameState(tableId, isAdmin = true) {
  const [state, setState] = useState(null);
  const [coaching, setCoaching] = useState(null);       // post-action grade
  const [advice, setAdvice] = useState(null);           // pre-action recommendation
  const stateRef = useRef(null);
  const villainTimerRef = useRef(null);
  const adviceForTurnRef = useRef(null); // tracks which "turn" we already fetched advice for, to avoid duplicate calls
  // Auto-play: Claude makes Hero's decisions instead of the human at the console.
  const [autoPlay, setAutoPlay] = useState(false);
  const autoActedForTurnRef = useRef(null);
  const heroActRef = useRef(null);

  const persist = useCallback(async (newState) => {
    stateRef.current = newState;
    setState(newState);
    if (!LOCAL_MODE && tableId) {
      await updateTable(tableId, newState);
      // A hand just completed and hasn't been saved yet — persist it to
      // hand_history, then clear the marker so it isn't saved again on
      // every subsequent state update (e.g. the next hand's blinds posting).
      if (newState.lastCompletedHand && !newState._handHistorySaved) {
        await saveHandHistory(tableId, newState.lastCompletedHand);
        newState._handHistorySaved = true;
      }
    }
  }, [tableId]);

  // Subscribe to remote updates (villain screens / joined friends), and
  // — critically — fetch the CURRENT state once on mount. Without this,
  // a freshly-loaded friend's browser has stateRef.current === null until
  // the next time someone else pushes an update, which silently breaks
  // claimSeat() (it bails out early on null state) right when a friend
  // first tries to join.
  useEffect(() => {
    if (LOCAL_MODE || !tableId || isAdmin) return;
    let cancelled = false;

    getTable(tableId).then(row => {
      if (cancelled || !row?.state) return;
      stateRef.current = row.state;
      setState(row.state);
    });

    const sub = subscribeToTable(tableId, (remoteState) => {
      stateRef.current = remoteState;
      setState(remoteState);
    });
    return () => { cancelled = true; sub.unsubscribe(); };
  }, [tableId, isAdmin]);

  // Fire pre-action advice automatically whenever it becomes Hero's turn.
  // A "turn fingerprint" (hand + phase + actingIdx) prevents re-fetching on
  // unrelated re-renders, while still re-firing for each genuinely new decision.
  useEffect(() => {
    if (!state) return;
    const heroIdx = state.players?.findIndex(p => p.isHero);
    if (heroIdx === -1 || state.actingIdx !== heroIdx) return;
    if (state.phase === 'idle' || state.phase === 'showdown') return;

    const fingerprint = turnFingerprint(state);
    if (adviceForTurnRef.current === fingerprint) return;
    adviceForTurnRef.current = fingerprint;

    const hero = state.players[heroIdx];
    setAdvice({ source: 'loading', fingerprint });
    getPreActionAdvice(hero, state)
      .then(result => {
        // Drop late answers for a decision that's already been made.
        if (adviceForTurnRef.current === fingerprint) setAdvice({ ...result, fingerprint });
      })
      .catch(() => setAdvice(null));
  }, [state]);

  // Auto-play: once advice for the current decision arrives, play it.
  // Also fires if auto-play is switched on while advice is already showing.
  useEffect(() => {
    if (!autoPlay || !state || !advice || advice.source === 'loading' || !advice.action) return;
    const heroIdx = state.players?.findIndex(p => p.isHero);
    if (heroIdx === -1 || state.actingIdx !== heroIdx) return;
    if (state.phase === 'idle' || state.phase === 'showdown') return;

    const fingerprint = turnFingerprint(state);
    if (advice.fingerprint !== fingerprint || autoActedForTurnRef.current === fingerprint) return;

    const timer = setTimeout(() => {
      const cur = stateRef.current;
      if (!cur || turnFingerprint(cur) !== fingerprint) return; // someone already acted
      autoActedForTurnRef.current = fingerprint;
      heroActRef.current?.(advice.action, advice.amount || 0, { auto: true });
    }, AUTO_PLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoPlay, advice, state]);

  const initSession = useCallback(async (config, playerDefs) => {
    const gs = createGameState(config);
    gs.players = playerDefs.map((pd, i) =>
      // Open seats are AI-controlled (isAI=true) until a human joins and
      // claims them via the seat-join screen — see claimSeat() below.
      createPlayer(i, pd.name, config.stack, pd.isHero, pd.isOpen !== false, pd.isOpen || false)
    );
    gs.dealerIdx = 0;
    if (!LOCAL_MODE && tableId) await createTable(tableId, gs);
    await persist(gs);
  }, [persist, tableId]);

  // Called when a friend opens the join screen, picks an open seat, and
  // types their name. Converts that seat from AI-controlled to human-
  // controlled. Safe to call concurrently from different devices — relies
  // on Supabase's last-write-wins, which is acceptable here since seat
  // claims are rare, deliberate actions (not a hot path like betting).
  const claimSeat = useCallback(async (seatIdx, playerName) => {
    let gs = deepClone(stateRef.current);
    if (!gs) {
      // Local state hasn't loaded yet (e.g. claimSeat called very soon
      // after mount, before the initial getTable() fetch resolved) — fetch
      // directly rather than failing. This is the fix for a real bug where
      // a freshly-joined friend's name silently never saved.
      const row = await getTable(tableId);
      gs = row?.state ? deepClone(row.state) : null;
    }
    if (!gs) return { ok: false, error: 'No active session' };
    const seat = gs.players[seatIdx];
    if (!seat) return { ok: false, error: 'Seat does not exist' };
    if (!seat.isOpen) return { ok: false, error: 'Seat already taken' };

    seat.isOpen = false;
    seat.isAI = false;
    seat.name = playerName.trim().slice(0, 24) || `Player ${seatIdx + 1}`;
    await persist(gs);
    return { ok: true, seatIdx };
  }, [persist, tableId]);

  const dealHand = useCallback(async () => {
    const gs = deepClone(stateRef.current);
    if (!gs || gs.players.length < 2) return;

    setCoaching(null);
    setAdvice(null);
    adviceForTurnRef.current = null;

    gs.handNum++;
    gs.deck = freshDeck();
    gs.communityCards = [];
    gs.pot = 0;
    gs.currentBet = 0;
    gs.minRaise = gs.config.bb;
    gs.phase = 'preflop';
    gs.log = [];
    gs.handLog = [];
    gs.handActions = []; // structured action list for this hand (sent to the AI advisor)
    gs.lastCompletedHand = null;
    gs._handHistorySaved = false;
    gs.preflopRaiseCount = 0; // tracks how many preflop raises have occurred, for 3-bet detection
    gs.handResultsRecorded = false; // guards against double-counting stats if hand-end logic runs twice

    gs.players.forEach(p => {
      if (p.stack <= 0) p.stack = gs.config.stack; // rebuy
      p.holeCards = [gs.deck.pop(), gs.deck.pop()];
      p.currentBet = 0;
      p.status = 'active';
      p._hand = freshHandFlags();
      p.stats.handsPlayed++;
    });

    gs.dealerIdx = (gs.dealerIdx + 1) % gs.players.length;
    const n = gs.players.length;
    const sbIdx = (gs.dealerIdx + 1) % n;
    const bbIdx = (gs.dealerIdx + 2) % n;

    postBlind(gs, sbIdx, gs.config.sb, 'SB');
    postBlind(gs, bbIdx, gs.config.bb, 'BB');
    gs.currentBet = gs.config.bb;
    gs.minRaise = gs.config.bb;
    gs.actingIdx = (bbIdx + 1) % n;
    gs.lastAggressorIdx = bbIdx;

    addLog(gs, `--- Hand #${gs.handNum} ---`, 'system');
    addLog(gs, `Dealer: Seat ${gs.dealerIdx + 1} | SB: Seat ${sbIdx + 1} | BB: Seat ${bbIdx + 1}`, 'system');
    gs.sessionStats.handsPlayed++;

    await persist(gs);
    scheduleVillainIfNeeded(gs);
  }, [persist]);

  const heroAct = useCallback(async (action, amount = 0, { auto = false } = {}) => {
    const gs = deepClone(stateRef.current);
    if (!gs) return;
    const heroIdx = gs.players.findIndex(p => p.isHero);
    if (gs.actingIdx !== heroIdx) return;
    const hero = gs.players[heroIdx];

    // Snapshot state BEFORE the action for accurate coaching context
    const beforeSnapshot = deepClone(gs);
    const heroBeforeSnapshot = deepClone(hero);
    const priorAdvice = advice; // what Claude recommended before this action

    applyAction(gs, heroIdx, action, amount);

    const next = advance(gs);
    const afterSnapshot = deepClone(gs);

    // Advice was for the decision just made — clear it, then show the grade.
    // No auto-hide: the grade stays visible until the next action replaces it.
    // Auto-played actions aren't graded: the coach would just be grading Claude's own play.
    setAdvice(null);
    if (auto) {
      setCoaching(null);
    } else {
      setCoaching({ grade: 'Analyzing…', explanation: 'Consulting AI coach…', source: 'loading' });
      getCoaching(action, amount, heroBeforeSnapshot, beforeSnapshot, afterSnapshot, priorAdvice)
        .then(coach => setCoaching(coach))
        .catch(() => setCoaching(null));
    }

    if (!next) { await persist(gs); return; }
    await persist(gs);
    if (gs.phase !== 'showdown' && gs.phase !== 'idle') {
      scheduleVillainIfNeeded(gs);
    }
  }, [persist, advice]);
  heroActRef.current = heroAct;

  // For joined human players (not Hero) — same underlying action logic as
  // heroAct, but no AI coaching calls (the player view doesn't show coach
  // panels, so there's no reason to spend API calls or compute fallback
  // advice here). Works for any seat index.
  const playerAct = useCallback(async (seatIdx, action, amount = 0) => {
    const gs = deepClone(stateRef.current);
    if (!gs) return;
    if (gs.actingIdx !== seatIdx) return;

    applyAction(gs, seatIdx, action, amount);
    const next = advance(gs);

    if (!next) { await persist(gs); return; }
    await persist(gs);
    if (gs.phase !== 'showdown' && gs.phase !== 'idle') {
      scheduleVillainIfNeeded(gs);
    }
  }, [persist]);

  function scheduleVillainIfNeeded(gs) {
    if (villainTimerRef.current) clearTimeout(villainTimerRef.current);
    const cur = gs.players[gs.actingIdx];
    if (cur && cur.isAI && cur.status === 'active') {
      villainTimerRef.current = setTimeout(() => runVillainChain(), 750);
    }
  }

  async function runVillainChain() {
    const gs = deepClone(stateRef.current);
    if (!gs || gs.phase === 'showdown' || gs.phase === 'idle') return;
    const cur = gs.players[gs.actingIdx];
    if (!cur || !cur.isAI || cur.status !== 'active') return;

    const { action, amount } = villainDecision(cur, gs);
    applyAction(gs, gs.actingIdx, action, amount);
    const cont = advance(gs);
    await persist(gs);

    if (cont && gs.phase !== 'showdown' && gs.phase !== 'idle') {
      const next = gs.players[gs.actingIdx];
      if (next && next.isAI && next.status === 'active') {
        villainTimerRef.current = setTimeout(() => runVillainChain(), 700);
      }
    }
  }

  return {
    state, coaching, advice, initSession, dealHand, heroAct, claimSeat, playerAct,
    autoPlay, setAutoPlay,
    closeAdvice: () => setAdvice(null),
    closeCoaching: () => setCoaching(null),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepClone(obj) {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function postBlind(gs, idx, amount, label) {
  const p = gs.players[idx];
  const actual = Math.min(amount, p.stack);
  p.stack -= actual;
  p.currentBet += actual;
  gs.pot += actual;
  p._hand.investedThisHand += actual; // counts toward net calc, but NOT vpip (blinds are forced)
  if (p.stack === 0) p.status = 'allin';
  recordAction(gs, idx, `posts ${label}`, actual);
  addLog(gs, `${p.name} posts ${label} ${actual}`, 'system');
}

// Structured per-hand action record. Unlike handLog (display strings), this
// is what the AI advisor reads to see how the current hand has played out.
function recordAction(gs, idx, action, amount = 0) {
  if (!gs.handActions) gs.handActions = [];
  const p = gs.players[idx];
  gs.handActions.push({ street: gs.phase, seat: idx, name: p.name, action, amount });
}

function addLog(gs, msg, type = 'action') {
  gs.log = [...(gs.log || []).slice(-60), { msg, type, ts: Date.now() }];
  if (gs.handLog) gs.handLog.push({ msg, type });
}

function applyAction(gs, idx, action, amount = 0) {
  const p = gs.players[idx];
  const callAmt = gs.currentBet - p.currentBet;
  const isPreflop = gs.phase === 'preflop';
  const h = p._hand;

  // Post-flop tendencies: did they face a bet this hand, and fold to it?
  if (!isPreflop && callAmt > 0) h.facedPostflopBet = true;

  if (action === 'fold') {
    p.status = 'folded';
    if (!isPreflop && callAmt > 0) h.foldedToPostflopBet = true;
    recordAction(gs, idx, 'folds');
    addLog(gs, `${p.name} folds`, p.isHero ? 'hero' : 'action');

  } else if (action === 'check') {
    recordAction(gs, idx, 'checks');
    addLog(gs, `${p.name} checks`, p.isHero ? 'hero' : 'action');

  } else if (action === 'call') {
    const actual = Math.min(callAmt, p.stack);
    p.stack -= actual; p.currentBet += actual; gs.pot += actual;
    p._hand.investedThisHand += actual;
    if (isPreflop && actual > 0) p._hand.vpip = true; // voluntarily called preflop = VPIP
    if (!isPreflop && actual > 0) h.postflopCalls = (h.postflopCalls || 0) + 1;
    if (p.stack === 0) p.status = 'allin';
    recordAction(gs, idx, 'calls', actual);
    addLog(gs, `${p.name} calls ${actual}`, p.isHero ? 'hero' : 'action');

  } else if (action === 'bet' || action === 'raise') {
    const toAdd = Math.min(amount - p.currentBet, p.stack);
    const newBet = p.currentBet + toAdd;
    gs.minRaise = Math.max(newBet - gs.currentBet, gs.minRaise);
    gs.currentBet = Math.max(gs.currentBet, newBet);
    p.stack -= toAdd; p.currentBet = newBet; gs.pot += toAdd;
    p._hand.investedThisHand += toAdd;
    if (isPreflop) {
      p._hand.vpip = true;
      p._hand.pfr = true; // any preflop raise = PFR
      gs.preflopRaiseCount = (gs.preflopRaiseCount || 0) + 1;
      // The SECOND preflop raise in a hand is a 3-bet (first raise = open, second = 3-bet)
      if (gs.preflopRaiseCount === 2) p._hand.threeBet = true;
    } else {
      h.postflopAggressive = (h.postflopAggressive || 0) + 1;
    }
    if (p.stack === 0) p.status = 'allin';
    gs.lastAggressorIdx = idx;
    recordAction(gs, idx, `${action}s to`, newBet);
    addLog(gs, `${p.name} ${action}s to ${newBet}`, p.isHero ? 'hero' : 'action');

  } else if (action === 'allin') {
    const toAdd = p.stack;
    const newBet = p.currentBet + toAdd;
    const isRaise = newBet > gs.currentBet;
    if (isRaise) {
      gs.minRaise = newBet - gs.currentBet;
      gs.currentBet = newBet;
      gs.lastAggressorIdx = idx;
    }
    p.stack -= toAdd; p.currentBet = newBet; gs.pot += toAdd;
    p._hand.investedThisHand += toAdd;
    if (isPreflop && toAdd > 0) {
      p._hand.vpip = true;
      if (isRaise) {
        p._hand.pfr = true;
        gs.preflopRaiseCount = (gs.preflopRaiseCount || 0) + 1;
        if (gs.preflopRaiseCount === 2) p._hand.threeBet = true;
      }
    }
    if (!isPreflop && toAdd > 0) {
      if (isRaise) h.postflopAggressive = (h.postflopAggressive || 0) + 1;
      else h.postflopCalls = (h.postflopCalls || 0) + 1;
    }
    p.status = 'allin';
    recordAction(gs, idx, 'goes all-in for', newBet);
    addLog(gs, `${p.name} ALL-IN for ${newBet}`, p.isHero ? 'hero' : 'action');
  }
}

function advance(gs) {
  const n = gs.players.length;
  const notFolded = gs.players.filter(p => p.status !== 'folded');
  const active = gs.players.filter(p => p.status === 'active');

  // Only one player left
  if (notFolded.length === 1) {
    awardUncontested(gs, notFolded[0]);
    return false;
  }

  // All remaining are allin → runout
  if (active.length === 0) {
    runout(gs);
    return false;
  }

  // Find next active player who still needs to act
  let next = (gs.actingIdx + 1) % n;
  let loops = 0;
  while (loops < n) {
    const p = gs.players[next];
    if (p.status === 'active' && (p.currentBet < gs.currentBet || next !== gs.lastAggressorIdx)) {
      gs.actingIdx = next;
      return true;
    }
    // If we reach the last aggressor and everyone has acted/matched → next street
    if (next === gs.lastAggressorIdx && allActed(gs)) break;
    next = (next + 1) % n;
    loops++;
  }

  nextStreet(gs);
  return gs.phase !== 'showdown';
}

function allActed(gs) {
  const active = gs.players.filter(p => p.status === 'active');
  return active.every(p => p.currentBet === gs.currentBet);
}

function nextStreet(gs) {
  const notFolded = gs.players.filter(p => p.status !== 'folded');
  if (notFolded.length <= 1) { if (notFolded.length === 1) awardUncontested(gs, notFolded[0]); return; }

  gs.players.forEach(p => { p.currentBet = 0; });
  gs.currentBet = 0;
  gs.minRaise = gs.config.bb;

  // First active after dealer
  const n = gs.players.length;
  let first = (gs.dealerIdx + 1) % n;
  let tries = 0;
  while (gs.players[first].status !== 'active' && tries < n) { first = (first + 1) % n; tries++; }
  gs.actingIdx = first;
  gs.lastAggressorIdx = first;

  if (gs.phase === 'preflop') {
    gs.phase = 'flop';
    for (let i = 0; i < 3; i++) gs.communityCards.push(gs.deck.pop());
    addLog(gs, '--- FLOP ---', 'system');
  } else if (gs.phase === 'flop') {
    gs.phase = 'turn';
    gs.communityCards.push(gs.deck.pop());
    addLog(gs, '--- TURN ---', 'system');
  } else if (gs.phase === 'turn') {
    gs.phase = 'river';
    gs.communityCards.push(gs.deck.pop());
    addLog(gs, '--- RIVER ---', 'system');
  } else if (gs.phase === 'river') {
    showdown(gs);
  }
}

function runout(gs) {
  while (gs.communityCards.length < 5) gs.communityCards.push(gs.deck.pop());
  showdown(gs);
}

function showdown(gs) {
  gs.phase = 'showdown';
  const eligible = gs.players.filter(p => p.status !== 'folded');
  const results = eligible.map(p => ({
    player: p,
    eval: bestHand([...p.holeCards, ...gs.communityCards])
  })).sort((a, b) => b.eval.score - a.eval.score);

  const topScore = results[0].eval.score;
  const winners = results.filter(r => r.eval.score === topScore);
  const share = Math.floor(gs.pot / winners.length);

  // Mark everyone who reached showdown (didn't fold) as having seen it —
  // this drives the WTSD% stat.
  eligible.forEach(p => { p._hand.sawShowdown = true; });

  winners.forEach(w => {
    w.player.stack += share;
    w.player._hand.totalWonThisHand = share;
    addLog(gs, `${w.player.name} wins ${share} — ${w.eval.name}`, 'win');
  });

  gs.showdownResults = results.map(r => ({
    name: r.player.name, isHero: r.player.isHero,
    isWinner: r.eval.score === topScore,
    handName: r.eval.name, won: r.eval.score === topScore ? share : 0,
    holeCards: r.player.holeCards
  }));

  // Remember what each player showed down, and how they played it. Only
  // hands actually revealed here go in — never folded or uncontested cards.
  const revealed = results.map(r => {
    const seat = gs.players.indexOf(r.player);
    return {
      handNum: gs.handNum,
      playerId: r.player.id,
      name: r.player.name,
      holeCards: r.player.holeCards,
      handName: r.eval.name,
      won: r.eval.score === topScore,
      board: [...gs.communityCards],
      actions: (gs.handActions || [])
        .filter(a => a.seat === seat && !a.action.startsWith('posts'))
        .map(a => ({ street: a.street, action: a.action, amount: a.amount })),
    };
  });
  gs.showdownHistory = [...(gs.showdownHistory || []), ...revealed].slice(-SHOWDOWN_HISTORY_LIMIT);

  finalizeHandStats(gs);
}

function awardUncontested(gs, winner) {
  winner.stack += gs.pot;
  winner._hand.totalWonThisHand = gs.pot;
  addLog(gs, `${winner.name} wins ${gs.pot} (uncontested)`, 'win');
  gs.phase = 'showdown';
  gs.showdownResults = [{ name: winner.name, isWinner: true, handName: 'Uncontested', won: gs.pot, holeCards: winner.holeCards }];
  finalizeHandStats(gs);
}

// ─── Stat Finalization ────────────────────────────────────────────────────────
// Called exactly once per hand, at the moment the hand ends (showdown or
// uncontested win). Rolls the per-hand transient flags (_hand) into the
// permanent cumulative stats. This is the ONLY place permanent stats are
// updated, which is what prevents the old bug where VPIP was incremented
// on every street instead of once per hand.
function finalizeHandStats(gs) {
  if (gs.handResultsRecorded) return; // guard against double-invocation
  gs.handResultsRecorded = true;

  gs.players.forEach(p => {
    const h = p._hand || {};
    if (h.vpip) p.stats.vpipCount++;
    if (h.pfr) p.stats.pfrCount++;
    if (h.threeBet) p.stats.threeBetCount++;
    if (h.sawShowdown) {
      p.stats.wtsdCount++;
      if (h.totalWonThisHand > 0) p.stats.wonAtShowdownCount++;
    }
    if (h.facedPostflopBet) p.stats.facedPostflopBetCount = (p.stats.facedPostflopBetCount || 0) + 1;
    if (h.foldedToPostflopBet) p.stats.foldedToPostflopBetCount = (p.stats.foldedToPostflopBetCount || 0) + 1;
    p.stats.postflopAggressiveCount = (p.stats.postflopAggressiveCount || 0) + (h.postflopAggressive || 0);
    p.stats.postflopCallCount = (p.stats.postflopCallCount || 0) + (h.postflopCalls || 0);
    p.stats.totalInvested += h.investedThisHand || 0;
    p.stats.totalWon += h.totalWonThisHand || 0;

    if (p.isHero) {
      gs.sessionStats.heroNet += (h.totalWonThisHand || 0) - (h.investedThisHand || 0);
      if (h.totalWonThisHand > 0) gs.sessionStats.heroWins++;
    }
  });

  // Build a structured record of this hand for history/review. Attached to
  // gameState (not saved here directly) so the hook — which has access to
  // tableId and the Supabase helpers — can persist it after this returns.
  gs.lastCompletedHand = {
    handNum: gs.handNum,
    dealerIdx: gs.dealerIdx,
    config: gs.config,
    players: gs.players.map(p => ({
      id: p.id, name: p.name, isHero: p.isHero,
      holeCards: p.holeCards,
      invested: p._hand?.investedThisHand || 0,
      won: p._hand?.totalWonThisHand || 0,
      vpip: !!p._hand?.vpip, pfr: !!p._hand?.pfr, threeBet: !!p._hand?.threeBet,
      sawShowdown: !!p._hand?.sawShowdown,
    })),
    communityCards: gs.communityCards,
    showdownResults: gs.showdownResults || null,
    finalPot: gs.pot,
    log: gs.handLog || [],
    timestamp: new Date().toISOString(),
  };
}
