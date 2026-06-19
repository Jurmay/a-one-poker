import React, { useState, useEffect, useCallback } from 'react';
import { getTable, subscribeToTable } from '../lib/supabase';

// Landing screen for friends joining via the shared link. Polls/subscribes
// to the live table so open seats update in real time as others join.
// On successful claim, calls onJoined(seatIdx) so the parent can switch
// into the player view (see App.js / PlayerView.jsx).

export function JoinScreen({ tableId, onJoined, claimSeatFn }) {
  const [tableState, setTableState] = useState(null);
  const [name, setName] = useState('');
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const row = await getTable(tableId);
    setTableState(row?.state || null);
    setLoading(false);
  }, [tableId]);

  useEffect(() => {
    refresh();
    const sub = subscribeToTable(tableId, (remoteState) => setTableState(remoteState));
    const poll = setInterval(refresh, 4000); // fallback in case realtime misses an update
    return () => { sub.unsubscribe(); clearInterval(poll); };
  }, [tableId, refresh]);

  async function handleJoin() {
    if (selectedSeat === null) { setError('Pick a seat first'); return; }
    if (!name.trim()) { setError('Enter your name'); return; }
    setJoining(true);
    setError(null);
    const result = await claimSeatFn(selectedSeat, name.trim());
    setJoining(false);
    if (result.ok) {
      onJoined(selectedSeat);
    } else {
      setError(result.error || 'Could not claim that seat — try another.');
      refresh(); // someone else may have just taken it
    }
  }

  const openSeats = (tableState?.players || []).filter(p => p.isOpen);
  const takenSeats = (tableState?.players || []).filter(p => !p.isOpen);

  return (
    <div className="min-h-screen bg-shell flex items-center justify-center px-4">
      <div className="bg-[#0F0F18] border border-gold/30 rounded-xl p-6 w-full max-w-sm">
        <div className="font-cinzel text-gold text-center text-lg tracking-[3px] mb-1">A-ONE POKER</div>
        <div className="text-center text-white/30 text-[10px] tracking-widest mb-6">JOIN TABLE</div>

        {loading && (
          <div className="text-white/40 text-sm italic text-center py-6">Looking for the table…</div>
        )}

        {!loading && !tableState && (
          <div className="text-amber-400/80 text-sm text-center py-6">
            No active table found. Ask the host to start a session first, then refresh this page.
          </div>
        )}

        {!loading && tableState && (
          <>
            {takenSeats.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] text-white/30 tracking-widest mb-1.5">ALREADY SEATED</div>
                <div className="flex flex-wrap gap-1.5">
                  {takenSeats.map(p => (
                    <span key={p.id} className="text-[11px] bg-white/5 text-white/50 px-2 py-1 rounded">
                      {p.isHero ? '👑 ' : ''}{p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {openSeats.length === 0 ? (
              <div className="text-white/40 text-sm text-center py-4">All seats are taken.</div>
            ) : (
              <>
                <div className="mb-3">
                  <label className="block text-[10px] text-white/40 tracking-widest mb-1.5">PICK YOUR SEAT</label>
                  <div className="grid grid-cols-2 gap-2">
                    {openSeats.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedSeat(p.id)}
                        className={`text-xs py-2 rounded border transition-colors ${
                          selectedSeat === p.id
                            ? 'border-gold bg-gold/15 text-gold'
                            : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25'
                        }`}
                      >
                        Seat {p.id + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] text-white/40 tracking-widest mb-1.5">YOUR NAME</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="Type your name"
                    maxLength={24}
                    className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
                  />
                </div>

                {error && <div className="text-red-400 text-xs mb-3 text-center">{error}</div>}

                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full py-3 bg-gold text-black font-cinzel font-bold text-sm tracking-[2px] rounded-lg hover:bg-gold-light transition-colors disabled:opacity-50"
                >
                  {joining ? 'JOINING…' : 'TAKE SEAT'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
