import React, { useState, useMemo } from 'react';
import { Card } from './Card';
import { bestHand, GRADE_COLORS } from '../engine/poker';

export function HeroConsole({ state, coaching, advice, onAction, onCloseAdvice, onCloseCoaching }) {
  const [raiseAmt, setRaiseAmt] = useState(0);

  const hero = state?.players?.find(p => p.isHero);
  const isHeroTurn = state && hero && state.actingIdx === state.players.findIndex(p => p.isHero);
  const phase = state?.phase || 'idle';
  const pot = state?.pot || 0;
  const currentBet = state?.currentBet || 0;

  const callAmt = hero ? Math.max(0, currentBet - hero.currentBet) : 0;
  const canCheck = callAmt === 0;
  const minRaise = (state?.minRaise || 0) + currentBet;
  const maxBet = hero ? hero.stack + (hero.currentBet || 0) : 0;

  // hand strength
  const handStrength = useMemo(() => {
    if (!hero?.holeCards?.length || !state?.communityCards?.length) return null;
    return bestHand([...hero.holeCards, ...state.communityCards]);
  }, [hero?.holeCards, state?.communityCards]);

  // init raise slider to min raise
  const effectiveRaise = raiseAmt < minRaise ? minRaise : raiseAmt;

  function act(action) {
    if (action === 'raise' || action === 'bet') onAction(action, effectiveRaise);
    else onAction(action, 0);
  }

  const disabled = !isHeroTurn || phase === 'showdown' || phase === 'idle';

  return (
    <div className="bg-shell/98 border-t-2 border-gold/20 px-4 py-3">
      {/* Top row: hero cards + hand strength + coaching */}
      <div className="flex items-start gap-4 mb-3">
        {/* Hero cards */}
        <div className="flex gap-2">
          {hero?.holeCards?.length === 2 && hero.status !== 'folded' ? (
            <>
              <Card card={hero.holeCards[0]} size="lg" />
              <Card card={hero.holeCards[1]} size="lg" />
            </>
          ) : (
            <>
              <div className="card-back w-12 h-16" />
              <div className="card-back w-12 h-16" />
            </>
          )}
        </div>

        {/* Hero info */}
        <div className="flex-1 min-w-0">
          <div className="text-sky-400 font-semibold text-sm">{hero?.name || 'Hero'}</div>
          <div className="text-white/50 text-xs">Stack: {hero?.stack?.toLocaleString() ?? '—'}</div>
          {handStrength && (
            <div className="text-gold text-xs mt-0.5 font-medium">{handStrength.name}</div>
          )}
          {phase === 'idle' && <div className="text-white/30 text-xs mt-1">Deal a new hand to start</div>}
          {isHeroTurn && (
            <div className="text-gold/80 text-xs mt-1">
              {canCheck ? 'Check or bet your hand' : `Call ${callAmt} or raise`}
            </div>
          )}
          {!isHeroTurn && phase !== 'idle' && phase !== 'showdown' && (
            <div className="text-white/30 text-xs mt-1">Waiting for other players…</div>
          )}
        </div>

        {/* AI Advice panel — shown BEFORE Hero acts */}
        {isHeroTurn && advice && (
          <div className="bg-shell border border-sky-700/40 rounded-lg px-3 py-2 min-w-[190px] max-w-[230px] relative">
            <button
              onClick={onCloseAdvice}
              className="absolute top-1.5 right-1.5 text-white/30 hover:text-white/70 text-xs leading-none w-4 h-4 flex items-center justify-center"
              title="Dismiss"
            >✕</button>
            <div className="flex items-center justify-between mb-1 pr-4">
              <span className="text-[9px] text-sky-400/70 tracking-widest">AI RECOMMENDS</span>
              {advice.source === 'claude' && (
                <span className="text-[8px] text-emerald-500/70" title="Powered by Claude">●</span>
              )}
              {advice.source === 'fallback' && (
                <span className="text-[8px] text-white/30" title="Offline / unavailable">○</span>
              )}
            </div>
            {advice.source === 'loading' ? (
              <div className="text-xs text-white/40 italic py-1">Thinking…</div>
            ) : (
              <>
                {advice.recommendation ? (
                  <div className="text-base font-bold text-sky-400 mb-1">
                    {advice.recommendation}{advice.sizing ? <span className="text-xs text-sky-400/70 font-medium ml-1">({advice.sizing})</span> : null}
                  </div>
                ) : null}
                <div className="text-[10px] text-white/55 leading-relaxed">{advice.reasoning}</div>
              </>
            )}
          </div>
        )}

        {/* AI Coach panel — shown AFTER Hero acts, grades the decision */}
        {coaching && (
          <div className="bg-shell border border-gold/30 rounded-lg px-3 py-2 min-w-[190px] max-w-[230px] relative">
            <button
              onClick={onCloseCoaching}
              className="absolute top-1.5 right-1.5 text-white/30 hover:text-white/70 text-xs leading-none w-4 h-4 flex items-center justify-center"
              title="Dismiss"
            >✕</button>
            <div className="flex items-center justify-between mb-1 pr-4">
              <span className="text-[9px] text-gold/60 tracking-widest">AI COACH</span>
              {coaching.source === 'claude' && (
                <span className="text-[8px] text-emerald-500/70" title="Powered by Claude">●</span>
              )}
              {coaching.source === 'fallback' && (
                <span className="text-[8px] text-white/30" title="Offline analysis">○</span>
              )}
            </div>
            {coaching.source === 'loading' ? (
              <div className="text-xs text-white/40 italic py-1">Analyzing your decision…</div>
            ) : (
              <>
                <div className={`text-base font-bold mb-1 ${GRADE_COLORS[coaching.grade] || 'text-white'}`}>
                  {coaching.grade}
                </div>
                {coaching.summary && (
                  <div className="text-[10px] text-white/80 font-medium mb-1">{coaching.summary}</div>
                )}
                <div className="text-[10px] text-white/55 leading-relaxed">{coaching.explanation}</div>
                {coaching.gtoNote && (
                  <div className="text-[10px] text-gold/70 leading-relaxed mt-1.5 pt-1.5 border-t border-gold/10">
                    GTO: {coaching.gtoNote}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Raise slider */}
      {isHeroTurn && (
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[10px] text-white/40 tracking-widest w-16">BET SIZE</span>
          <input
            type="range"
            min={minRaise}
            max={maxBet}
            value={effectiveRaise}
            step={Math.max(1, Math.floor(state?.config?.bb / 2))}
            onChange={e => setRaiseAmt(parseInt(e.target.value))}
            className="flex-1 accent-yellow-500"
          />
          <span className="text-gold font-semibold text-sm w-20 text-right">
            {effectiveRaise.toLocaleString()}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          className="action-btn bg-red-800 text-white hover:bg-red-700"
          disabled={disabled}
          onClick={() => act('fold')}
        >FOLD</button>

        {canCheck ? (
          <button
            className="action-btn bg-emerald-800 text-white hover:bg-emerald-700"
            disabled={disabled}
            onClick={() => act('check')}
          >CHECK</button>
        ) : (
          <button
            className="action-btn bg-blue-900 text-white hover:bg-blue-800"
            disabled={disabled}
            onClick={() => act('call')}
          >CALL {callAmt > 0 ? callAmt.toLocaleString() : ''}</button>
        )}

        <button
          className="action-btn bg-yellow-800 text-white hover:bg-yellow-700"
          disabled={disabled}
          onClick={() => act(callAmt === 0 ? 'bet' : 'raise')}
        >{callAmt === 0 ? 'BET' : 'RAISE'}</button>

        <button
          className="action-btn bg-purple-900 text-white hover:bg-purple-800"
          disabled={disabled}
          onClick={() => act('allin')}
        >ALL IN</button>
      </div>
    </div>
  );
}
