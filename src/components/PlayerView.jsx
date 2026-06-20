import React, { useState } from 'react';
import { PokerTable } from './PokerTable';
import { Card } from './Card';

// What a joined friend sees: the table, their own cards, and action buttons
// when it's their turn. No Setup, no AI Coach, no Hand History, no villain
// profile clicking — this is intentionally the stripped-down player view,
// not the admin console.

export function PlayerView({ state, seatIdx, onAction }) {
  const me = state?.players?.[seatIdx];
  const isMyTurn = state && me && state.actingIdx === seatIdx;
  const phase = state?.phase || 'idle';
  const currentBet = state?.currentBet || 0;
  const callAmt = me ? Math.max(0, currentBet - me.currentBet) : 0;
  const canCheck = callAmt === 0;
  const [raiseAmt, setRaiseAmt] = useState(0);

  const minRaise = (state?.minRaise || 0) + currentBet;
  const maxBet = me ? me.stack + (me.currentBet || 0) : 0;
  const effectiveRaise = raiseAmt < minRaise ? minRaise : raiseAmt;

  if (!me) {
    return (
      <div className="min-h-screen bg-shell flex items-center justify-center text-white/40 text-sm">
        Waiting for the table…
      </div>
    );
  }

  const disabled = !isMyTurn || phase === 'showdown' || phase === 'idle';

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#0A0A0F' }}>
      {/* Minimal topbar — just identity, no admin actions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gold/20 bg-shell/95 shrink-0">
        <div className="font-cinzel text-gold text-sm tracking-[2px]">A-ONE POKER</div>
        <div className="text-xs text-sky-400 font-medium">{me.name}</div>
      </div>

      {/* Table */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {state && <PokerTable state={state} viewerSeatIdx={seatIdx} />}
      </div>

      {/* Player console — same controls as Hero, no coach panels */}
      <div className="bg-shell/98 border-t-2 border-gold/20 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex gap-2">
            {me.holeCards?.length === 2 && me.status !== 'folded' ? (
              <>
                <Card card={me.holeCards[0]} size="lg" />
                <Card card={me.holeCards[1]} size="lg" />
              </>
            ) : (
              <>
                <div className="card-back w-12 h-16" />
                <div className="card-back w-12 h-16" />
              </>
            )}
          </div>
          <div>
            <div className="text-white/50 text-xs">Stack: {me.stack?.toLocaleString()}</div>
            {isMyTurn && (
              <div className="text-gold/80 text-xs mt-1">
                {canCheck ? 'Check or bet your hand' : `Call ${callAmt} or raise`}
              </div>
            )}
            {!isMyTurn && phase !== 'idle' && phase !== 'showdown' && (
              <div className="text-white/30 text-xs mt-1">Waiting for other players…</div>
            )}
            {phase === 'idle' && (
              <div className="text-white/30 text-xs mt-1">Waiting for the host to deal</div>
            )}
          </div>
        </div>

        {isMyTurn && (
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] text-white/40 tracking-widest w-16">BET SIZE</span>
            <input
              type="range"
              min={minRaise}
              max={maxBet}
              value={effectiveRaise}
              step={Math.max(1, Math.floor((state?.config?.bb || 100) / 2))}
              onChange={e => setRaiseAmt(parseInt(e.target.value))}
              className="flex-1 accent-yellow-500"
            />
            <span className="text-gold font-semibold text-sm w-20 text-right">
              {effectiveRaise.toLocaleString()}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="action-btn bg-red-800 text-white hover:bg-red-700"
            disabled={disabled}
            onClick={() => onAction('fold', 0)}
          >FOLD</button>

          {canCheck ? (
            <button
              className="action-btn bg-emerald-800 text-white hover:bg-emerald-700"
              disabled={disabled}
              onClick={() => onAction('check', 0)}
            >CHECK</button>
          ) : (
            <button
              className="action-btn bg-blue-900 text-white hover:bg-blue-800"
              disabled={disabled}
              onClick={() => onAction('call', 0)}
            >CALL {callAmt > 0 ? callAmt.toLocaleString() : ''}</button>
          )}

          <button
            className="action-btn bg-yellow-800 text-white hover:bg-yellow-700"
            disabled={disabled}
            onClick={() => onAction(callAmt === 0 ? 'bet' : 'raise', effectiveRaise)}
          >{callAmt === 0 ? 'BET' : 'RAISE'}</button>

          <button
            className="action-btn bg-purple-900 text-white hover:bg-purple-800"
            disabled={disabled}
            onClick={() => onAction('allin', 0)}
          >ALL IN</button>
        </div>
      </div>
    </div>
  );
}
