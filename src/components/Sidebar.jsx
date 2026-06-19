import React from 'react';

const LOG_COLORS = {
  system:  'text-white/35 italic',
  action:  'text-white/70',
  hero:    'text-sky-400 font-medium',
  win:     'text-emerald-400 font-semibold',
};

export function Sidebar({ state, onSelectVillain }) {
  const log = state?.log || [];
  const stats = state?.sessionStats || {};
  const players = state?.players || [];
  const hero = players.find(p => p.isHero);
  const heroHands = hero?.stats?.handsPlayed || 0;

  const vpip = heroHands > 0
    ? Math.round((hero.stats.vpipCount / heroHands) * 100)
    : 0;
  const wr = stats.handsPlayed > 0
    ? Math.round((stats.heroWins / stats.handsPlayed) * 100)
    : 0;

  return (
    <div className="hidden md:flex md:w-52 flex-col bg-shell/95 border-l border-gold/15 shrink-0">
      {/* Log */}
      <div className="text-[10px] text-gold tracking-widest px-3 py-2 border-b border-gold/15">
        ACTION HISTORY
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-gold" style={{ maxHeight: 280 }}>
        {[...log].reverse().map((entry, i) => (
          <div key={i} className={`text-[10px] px-1 py-0.5 rounded mb-0.5 leading-snug ${LOG_COLORS[entry.type] || 'text-white/60'}`}>
            {entry.msg}
          </div>
        ))}
        {log.length === 0 && (
          <div className="text-white/20 text-[10px] px-1 py-2 italic">No actions yet</div>
        )}
      </div>

      {/* Stats */}
      <div className="border-t border-gold/15 px-3 py-2 space-y-1">
        <div className="text-[10px] text-gold tracking-widest mb-1.5">SESSION STATS</div>
        {[
          ['Hands', stats.handsPlayed || 0],
          ['Hero VPIP', vpip + '%'],
          ['Win Rate', wr + '%'],
          ['Net', (stats.heroNet >= 0 ? '+' : '') + (stats.heroNet || 0).toLocaleString()],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between text-[10px]">
            <span className="text-white/40">{label}</span>
            <span className={`font-medium ${label === 'Net' ? (stats.heroNet >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white/80'}`}>
              {val}
            </span>
          </div>
        ))}
      </div>

      {/* Villain profiles */}
      {players.filter(p => !p.isHero && p.stats?.handsPlayed > 0).length > 0 && (
        <div className="border-t border-gold/15 px-3 py-2">
          <div className="text-[10px] text-gold tracking-widest mb-1.5">VILLAIN PROFILES</div>
          {players.filter(p => !p.isHero).map(p => {
            const vHands = p.stats?.handsPlayed || 0;
            const vp = vHands > 0 ? Math.round((p.stats.vpipCount / vHands) * 100) : 0;
            return (
              <div
                key={p.id}
                onClick={() => onSelectVillain && onSelectVillain(p)}
                className="text-[10px] mb-1 cursor-pointer hover:text-white/90 transition-colors"
              >
                <span className="text-white/60">{p.name}: </span>
                <span className="text-gold">VPIP {vp}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
