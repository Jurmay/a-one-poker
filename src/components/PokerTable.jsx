import React, { useMemo, useRef, useEffect, useState } from 'react';
import { PlayerSeat } from './PlayerSeat';
import { Card, CardPlaceholder } from './Card';

// Seat positions are computed as PERCENTAGES of the table's own width/height,
// not fixed pixels — this is what makes seats reposition correctly as the
// table itself resizes on different screens (laptop vs. mobile vs. wide
// monitor). rx/ry are expressed as fractions of the table's half-width/height.
function seatPositions(n, rxFrac = 0.84, ryFrac = 0.82) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      xPct: 50 + rxFrac * 50 * Math.cos(angle),
      yPct: 50 + ryFrac * 50 * Math.sin(angle),
    };
  });
}

export function PokerTable({ state, onSelectVillain, viewerSeatIdx = null }) {
  const { players = [], communityCards = [], pot = 0, phase = 'idle', actingIdx, dealerIdx, showdownResults } = state || {};

  const positions = useMemo(() => seatPositions(players.length), [players.length]);

  const communityToShow =
    phase === 'preflop' ? 0 :
    phase === 'flop'    ? 3 :
    phase === 'turn'    ? 4 : 5;

  const isShowdown = phase === 'showdown';

  // Card size scales down on narrow viewports so the table never overflows
  // on phones/small laptops — checked via a simple resize listener rather
  // than CSS alone, since seat label widths also need to shrink in step.
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const communityCardSize = isCompact ? 'sm' : 'md';

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-3" style={{ minHeight: 0 }}>
      {/* Felt oval — fluid width/height via aspect-ratio + max constraints,
          so it scales with the available space instead of a fixed pixel box. */}
      <div
        className="felt-oval relative w-full"
        style={{
          maxWidth: 640,
          aspectRatio: '1.93 / 1', // matches the original 560x290 proportions
          minHeight: 220,
        }}
      >
        {/* Community cards */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
          <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-center">
            {Array.from({ length: 5 }, (_, i) =>
              i < communityToShow && communityCards[i]
                ? <Card key={i} card={communityCards[i]} size={communityCardSize} />
                : <CardPlaceholder key={i} size={communityCardSize} />
            )}
          </div>
          {pot > 0 && (
            <div className="text-center">
              <div className="font-cinzel text-gold text-xs sm:text-sm tracking-widest">POT: {pot.toLocaleString()}</div>
              <div className="text-[8px] sm:text-[9px] text-white/40 tracking-[3px] uppercase">{phase}</div>
            </div>
          )}
          {phase === 'idle' && (
            <div className="font-cinzel text-gold/40 text-sm tracking-widest">A-ONE POKER</div>
          )}
        </div>

        {/* Player seats — positioned via percentage coordinates so they track
            the table's actual rendered size at any viewport width. */}
        {players.map((p, i) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isActive={i === actingIdx}
            isDealer={i === dealerIdx}
            showCards={isShowdown}
            isViewerSeat={viewerSeatIdx !== null && i === viewerSeatIdx}
            onClick={onSelectVillain}
            style={{ top: `${positions[i]?.yPct}%`, left: `${positions[i]?.xPct}%` }}
          />
        ))}
      </div>

      {/* Showdown result — rendered BELOW the table, never covering the
          community cards or seats, so the board stays visible at showdown. */}
      {isShowdown && showdownResults && (
        <div className="bg-shell/95 border border-gold/40 rounded-xl px-6 py-3 text-center shadow-2xl w-full"
          style={{ maxWidth: 420 }}>
          <div className="font-cinzel text-gold text-sm tracking-widest mb-2">SHOWDOWN</div>
          {showdownResults.map((r, i) => (
            <div key={i} className="text-sm mb-1">
              <span className={r.isWinner ? 'text-emerald-400 font-semibold' : 'text-white/60'}>
                {r.isWinner ? '🏆 ' : ''}{r.name}
              </span>
              <span className="text-gold/70 text-xs ml-1">— {r.handName}</span>
              {r.isWinner && <span className="text-emerald-400 text-xs ml-1">+{r.won.toLocaleString()}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
