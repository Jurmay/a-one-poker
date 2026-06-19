import React, { useEffect, useState } from 'react';
import { getHandHistory } from '../lib/supabase';
import { Card } from './Card';

// Displays recently completed hands for this table, fetched from Supabase's
// hand_history table. Opened from the topbar (see App.js). Read-only — this
// is a review tool, not part of active gameplay.

export function HandHistoryPanel({ tableId, onClose }) {
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHandHistory(tableId, 30)
      .then(rows => { if (!cancelled) { setHands(rows); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(String(err)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tableId]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[#0F0F18] border border-gold/30 rounded-xl p-5 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="font-cinzel text-gold text-base tracking-wide">HAND HISTORY</div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 text-sm leading-none w-6 h-6 flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-gold pr-1">
          {loading && <div className="text-white/40 text-sm italic py-6 text-center">Loading hand history…</div>}

          {error && (
            <div className="text-amber-400/80 text-xs py-4 text-center">
              Couldn't load hand history. This requires Supabase to be configured (see .env.local).
            </div>
          )}

          {!loading && !error && hands.length === 0 && (
            <div className="text-white/30 text-sm italic py-6 text-center">No completed hands yet this session.</div>
          )}

          {hands.map(row => {
            const h = row.hand;
            const isOpen = expandedId === row.id;
            const hero = h.players?.find(p => p.isHero);
            const heroNet = (hero?.won || 0) - (hero?.invested || 0);

            return (
              <div key={row.id} className="border border-white/10 rounded-lg mb-2 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : row.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">Hand #{h.handNum}</span>
                    {hero?.holeCards?.length === 2 && (
                      <span className="flex gap-1">
                        <Card card={hero.holeCards[0]} size="sm" />
                        <Card card={hero.holeCards[1]} size="sm" />
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold ${heroNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {heroNet >= 0 ? '+' : ''}{heroNet.toLocaleString()}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 py-2.5 text-[11px] text-white/60 space-y-1.5 border-t border-white/10">
                    {h.communityCards?.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/40">Board:</span>
                        <span className="flex gap-1">
                          {h.communityCards.map((c, i) => <Card key={i} card={c} size="sm" />)}
                        </span>
                      </div>
                    )}
                    <div>Pot: <span className="text-gold">{h.finalPot?.toLocaleString()}</span></div>
                    {h.showdownResults && (
                      <div className="space-y-0.5">
                        {h.showdownResults.map((r, i) => (
                          <div key={i}>
                            <span className={r.isWinner ? 'text-emerald-400' : 'text-white/50'}>
                              {r.isWinner ? '🏆 ' : ''}{r.name}
                            </span>
                            {r.handName && <span className="text-white/30 ml-1">— {r.handName}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-1 border-t border-white/5 text-white/30">
                      {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
