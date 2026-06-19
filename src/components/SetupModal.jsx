import React, { useState } from 'react';

export function SetupModal({ onStart }) {
  const [stack, setStack] = useState(10000);
  const [sb, setSb] = useState(50);
  const [bb, setBb] = useState(100);
  const [numPlayers, setNumPlayers] = useState(4);
  const [heroName, setHeroName] = useState('Hero');
  const [heroSeat, setHeroSeat] = useState(0);

  function handleNumChange(n) {
    const num = Math.max(2, Math.min(7, parseInt(n) || 4));
    setNumPlayers(num);
    if (heroSeat >= num) setHeroSeat(0);
  }

  function handleStart() {
    const config = { stack, sb, bb };
    // Hero takes their chosen seat. Every other seat starts OPEN — unclaimed
    // by a human, played by AI until a friend joins via the seat-join screen
    // and types their name into that seat. See JoinScreen.jsx.
    const playerDefs = Array.from({ length: numPlayers }, (_, i) => {
      if (i === heroSeat) return { name: heroName || 'Hero', isHero: true, isOpen: false };
      return { name: `Seat ${i + 1}`, isHero: false, isOpen: true };
    });
    onStart(config, playerDefs);
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50">
      <div className="bg-[#0F0F18] border border-gold/30 rounded-xl p-6 w-[380px] max-h-[90vh] overflow-y-auto scrollbar-gold">
        <div className="font-cinzel text-gold text-center text-lg tracking-[3px] mb-6">SESSION SETUP</div>

        <div className="space-y-4">
          {/* Stakes */}
          <div>
            <label className="block text-[10px] text-white/40 tracking-widest mb-1">STARTING STACK</label>
            <input
              type="number" value={stack} min={100}
              onChange={e => setStack(parseInt(e.target.value) || 1000)}
              className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] text-white/40 tracking-widest mb-1">SMALL BLIND</label>
              <input type="number" value={sb} min={1}
                onChange={e => setSb(parseInt(e.target.value) || 25)}
                className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-white/40 tracking-widest mb-1">BIG BLIND</label>
              <input type="number" value={bb} min={2}
                onChange={e => setBb(parseInt(e.target.value) || 50)}
                className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
              />
            </div>
          </div>

          {/* Number of players */}
          <div>
            <label className="block text-[10px] text-white/40 tracking-widest mb-1">TOTAL SEATS (2–7)</label>
            <input type="number" value={numPlayers} min={2} max={7}
              onChange={e => handleNumChange(e.target.value)}
              className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
            />
            <div className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
              Friends claim the other seats by opening the join link and typing their name.
              Unclaimed seats play as AI until someone joins.
            </div>
          </div>

          {/* Hero name + seat */}
          <div>
            <label className="block text-[10px] text-white/40 tracking-widest mb-1">YOUR NAME</label>
            <input
              value={heroName}
              onChange={e => setHeroName(e.target.value)}
              placeholder="Hero"
              className="w-full bg-white/5 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-white/40 tracking-widest mb-1">YOUR SEAT</label>
            <select
              value={heroSeat}
              onChange={e => setHeroSeat(parseInt(e.target.value))}
              className="w-full bg-[#0F0F18] border border-gold/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
            >
              {Array.from({ length: numPlayers }, (_, i) => (
                <option key={i} value={i}>Seat {i + 1}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleStart}
          className="mt-6 w-full py-3 bg-gold text-black font-cinzel font-bold text-sm tracking-[3px] rounded-lg hover:bg-gold-light transition-colors"
        >
          START SESSION
        </button>
      </div>
    </div>
  );
}
