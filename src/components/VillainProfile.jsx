import React from 'react';

// Displays a single villain's accumulated stats for the session. Opened by
// clicking their seat at the table (see PlayerSeat.jsx / PokerTable.jsx).
// All percentages are computed from the permanent, hand-finalized counters
// in player.stats — see finalizeHandStats() in useGameState.js for how
// these are correctly tracked once per hand (not per street/action).

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function StatRow({ label, value, hint }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-white/5 last:border-0">
      <div>
        <span className="text-xs text-white/70">{label}</span>
        {hint && <span className="text-[10px] text-white/30 ml-1.5">{hint}</span>}
      </div>
      <span className="text-sm font-semibold text-gold">{value}</span>
    </div>
  );
}

export function VillainProfile({ player, onClose }) {
  if (!player) return null;
  const s = player.stats || {};
  const hands = s.handsPlayed || 0;

  const vpip = pct(s.vpipCount, hands);
  const pfr = pct(s.pfrCount, hands);
  const threeBet = pct(s.threeBetCount, hands);
  const wtsd = pct(s.wtsdCount, hands);
  const wsd = pct(s.wonAtShowdownCount, s.wtsdCount); // % won GIVEN they reached showdown
  const net = (s.totalWon || 0) - (s.totalInvested || 0);
  const foldToBet = pct(s.foldedToPostflopBetCount, s.facedPostflopBetCount);
  const pfCalls = s.postflopCallCount || 0;
  const pfAggr = s.postflopAggressiveCount || 0;
  const af = pfCalls > 0 ? (pfAggr / pfCalls).toFixed(1) : (pfAggr > 0 ? '∞' : '—');

  // Simple playstyle read derived from VPIP/PFR — this is a description of
  // observed tendency, not a claim about the player's actual strategy.
  let styleNote;
  if (hands < 5) {
    styleNote = 'Not enough hands yet for a reliable read.';
  } else if (vpip <= 15) {
    styleNote = 'Very tight — folds most hands preflop. Hands they play are likely strong.';
  } else if (vpip <= 28) {
    styleNote = pfr / Math.max(vpip, 1) >= 0.6
      ? 'Tight-aggressive — selective but raises rather than calls when entering a pot.'
      : 'Tight-passive — selective but tends to call rather than raise.';
  } else if (vpip <= 45) {
    styleNote = 'Loose — plays a wide range of starting hands.';
  } else {
    styleNote = 'Very loose — plays most hands dealt. Likely to call down with weaker holdings.';
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[#0F0F18] border border-gold/30 rounded-xl p-5 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="font-cinzel text-gold text-base tracking-wide">{player.name}</div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 text-sm leading-none w-6 h-6 flex items-center justify-center">✕</button>
        </div>
        <div className="text-[10px] text-white/30 tracking-widest mb-4">{hands} HAND{hands === 1 ? '' : 'S'} OBSERVED</div>

        {hands === 0 ? (
          <div className="text-sm text-white/40 italic py-4 text-center">No hands played yet this session.</div>
        ) : (
          <>
            <div className="mb-3">
              <StatRow label="VPIP" value={`${vpip}%`} hint="voluntarily plays" />
              <StatRow label="PFR" value={`${pfr}%`} hint="raises preflop" />
              <StatRow label="3-Bet" value={`${threeBet}%`} hint="re-raises preflop" />
              <StatRow label="WTSD" value={`${wtsd}%`} hint="reaches showdown" />
              <StatRow label="W$SD" value={s.wtsdCount > 0 ? `${wsd}%` : '—'} hint="wins at showdown" />
              <StatRow label="Fold to Bet" value={s.facedPostflopBetCount > 0 ? `${foldToBet}%` : '—'} hint="post-flop" />
              <StatRow label="AF" value={af} hint="post-flop bets+raises / calls" />
              <StatRow
                label="Net (session)"
                value={`${net >= 0 ? '+' : ''}${net.toLocaleString()}`}
              />
            </div>
            <div className="bg-white/5 rounded-lg px-3 py-2.5 text-[11px] text-white/60 leading-relaxed">
              {styleNote}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
