import React from 'react';
import { Card, CardPlaceholder } from './Card';

export function PlayerSeat({ player, isActive, isDealer, showCards = false, isViewerSeat = false, style, onClick }) {
  const ringClass = [
    'seat-ring',
    isActive ? 'active' : '',
    player.isHero ? 'hero' : '',
    player.status === 'allin' ? 'allin' : '',
    player.status === 'folded' ? 'folded' : '',
  ].filter(Boolean).join(' ');

  const statusLabel =
    player.status === 'folded' ? 'FOLDED' :
    player.status === 'allin'  ? 'ALL-IN' :
    isActive                   ? '◉ ACTING' : '';

  const clickable = !player.isHero && typeof onClick === 'function';

  return (
    <div style={style} className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2">
      {/* Cards — face up ONLY at showdown, or for whichever seat belongs to
          the person actually viewing this screen (isViewerSeat). This is
          NOT the same as player.isHero: in multiplayer, each joined friend
          views the identical PokerTable component, but should only ever
          see their OWN cards, never Hero's or another player's. */}
      <div className="flex gap-1 relative">
        {player.holeCards?.length === 2 ? (
          <>
            <Card card={player.holeCards[0]} size="sm" faceDown={!showCards && !isViewerSeat} />
            <Card card={player.holeCards[1]} size="sm" faceDown={!showCards && !isViewerSeat} />
          </>
        ) : (
          <>
            <CardPlaceholder size="sm" />
            <CardPlaceholder size="sm" />
          </>
        )}
        {isDealer && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border-2 border-gray-400 text-black text-[9px] font-bold flex items-center justify-center">
            D
          </div>
        )}
      </div>

      {/* Info box */}
      <div
        onClick={clickable ? () => onClick(player) : undefined}
        className={`${ringClass} bg-shell/90 border border-gold/25 rounded-lg px-2.5 py-1.5 text-center min-w-[80px] ${clickable ? 'cursor-pointer hover:border-gold/60 transition-colors' : ''}`}
        title={clickable ? `View ${player.name}'s profile` : undefined}
      >
        <div className="text-[11px] font-semibold text-card truncate max-w-[90px]">{player.name}</div>
        <div className="text-[10px] text-gold">{player.stack.toLocaleString()}</div>
        {player.currentBet > 0 && (
          <div className="text-[9px] text-gold-light">Bet: {player.currentBet}</div>
        )}
        {statusLabel && (
          <div className={`text-[9px] mt-0.5 ${player.status === 'allin' ? 'text-red-400' : player.status === 'folded' ? 'text-gray-500' : 'text-gold-light'}`}>
            {statusLabel}
          </div>
        )}
      </div>
    </div>
  );
}
