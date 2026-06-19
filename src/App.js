import React, { useState, useCallback } from 'react';
import { PokerTable } from './components/PokerTable';
import { HeroConsole } from './components/HeroConsole';
import { Sidebar } from './components/Sidebar';
import { SetupModal } from './components/SetupModal';
import { VillainProfile } from './components/VillainProfile';
import { HandHistoryPanel } from './components/HandHistoryPanel';
import { JoinScreen } from './components/JoinScreen';
import { PlayerView } from './components/PlayerView';
import { useGameState } from './hooks/useGameState';

const TABLE_ID = 'aone-main';

// Simple URL-based split, no router needed for two screens:
//   /            -> Admin console (Hero + host controls)
//   /?join=1     -> Join screen, then becomes the player view after claiming a seat
function isJoinMode() {
  return new URLSearchParams(window.location.search).get('join') === '1';
}

export default function App() {
  return isJoinMode() ? <FriendApp /> : <AdminApp />;
}

// ─── Friend flow: join screen -> player view ──────────────────────────────────
function FriendApp() {
  const [seatIdx, setSeatIdx] = useState(null);
  const { state, claimSeat, playerAct } = useGameState(TABLE_ID, false);

  if (seatIdx === null) {
    return <JoinScreen tableId={TABLE_ID} onJoined={setSeatIdx} claimSeatFn={claimSeat} />;
  }

  return (
    <PlayerView
      state={state}
      seatIdx={seatIdx}
      onAction={(action, amount) => playerAct(seatIdx, action, amount)}
    />
  );
}

// ─── Host/admin flow: full console, unchanged from before ────────────────────
function AdminApp() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [selectedVillainId, setSelectedVillainId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showJoinLink, setShowJoinLink] = useState(false);

  const { state, coaching, advice, initSession, dealHand, heroAct, closeAdvice, closeCoaching } = useGameState(TABLE_ID, true);

  const handleStart = useCallback(async (config, playerDefs) => {
    await initSession(config, playerDefs);
    setSessionStarted(true);
    setShowSetup(false);
  }, [initSession]);

  const handleNewHand = useCallback(async () => {
    await dealHand();
  }, [dealHand]);

  const phase = state?.phase || 'idle';
  const handNum = state?.handNum || 0;
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=1`;

  return (
    <div id="app" className="flex flex-col" style={{ height: '100vh', background: '#0A0A0F' }}>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gold/20 bg-shell/95 shrink-0">
        <div>
          <div className="font-cinzel text-gold text-lg font-bold tracking-[3px]">A-ONE POKER</div>
          <div className="text-[9px] text-white/30 tracking-[4px] -mt-0.5">TRAINING SUITE</div>
        </div>
        <div className="flex items-center gap-2">
          {handNum > 0 && (
            <span className="text-[10px] text-white/30">Hand #{handNum}</span>
          )}
          <button
            onClick={() => setShowSetup(true)}
            className="text-gold border border-gold/30 bg-gold/10 hover:bg-gold/20 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          >
            ⚙ Setup
          </button>
          {sessionStarted && (
            <button
              onClick={() => setShowJoinLink(true)}
              className="text-gold border border-gold/30 bg-gold/10 hover:bg-gold/20 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              🔗 Invite
            </button>
          )}
          {sessionStarted && (
            <button
              onClick={() => setShowHistory(true)}
              className="text-gold border border-gold/30 bg-gold/10 hover:bg-gold/20 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              📜 History
            </button>
          )}
          {sessionStarted && (
            <button
              onClick={handleNewHand}
              disabled={phase !== 'idle' && phase !== 'showdown'}
              className="bg-gold text-black font-cinzel font-bold text-xs tracking-widest px-4 py-1.5 rounded hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === 'showdown' ? 'NEXT HAND' : phase === 'idle' ? 'DEAL' : 'IN PROGRESS'}
            </button>
          )}
          {sessionStarted && (
            <button
              onClick={() => { setSessionStarted(false); setShowSetup(true); }}
              className="text-red-400 border border-red-900/50 bg-red-900/10 hover:bg-red-900/25 px-3 py-1.5 rounded text-xs transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          {state ? (
            <PokerTable state={state} onSelectVillain={(p) => setSelectedVillainId(p.id)} />
          ) : (
            <div className="text-center">
              <div className="font-cinzel text-gold/30 text-2xl tracking-[6px] mb-3">A-ONE POKER</div>
              <div className="text-white/20 text-sm">Configure your session to begin</div>
            </div>
          )}
        </div>
        {state && <Sidebar state={state} onSelectVillain={(p) => setSelectedVillainId(p.id)} />}
      </div>

      {state && (
        <HeroConsole
          state={state}
          coaching={coaching}
          advice={advice}
          onAction={heroAct}
          onCloseAdvice={closeAdvice}
          onCloseCoaching={closeCoaching}
        />
      )}

      {showSetup && <SetupModal onStart={handleStart} />}

      {selectedVillainId !== null && state && (
        <VillainProfile
          player={state.players.find(p => p.id === selectedVillainId)}
          onClose={() => setSelectedVillainId(null)}
        />
      )}

      {showHistory && (
        <HandHistoryPanel tableId={TABLE_ID} onClose={() => setShowHistory(false)} />
      )}

      {showJoinLink && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setShowJoinLink(false)}>
          <div className="bg-[#0F0F18] border border-gold/30 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="font-cinzel text-gold text-base tracking-wide mb-3">INVITE FRIENDS</div>
            <div className="text-xs text-white/50 mb-3 leading-relaxed">
              Share this link on your local network. Friends open it, pick an open seat, and type their name.
            </div>
            <div className="bg-white/5 border border-gold/20 rounded px-3 py-2 text-xs text-gold break-all mb-3 select-all">
              {joinUrl}
            </div>
            <button
              onClick={() => { navigator.clipboard?.writeText(joinUrl); }}
              className="w-full py-2 bg-gold text-black font-cinzel font-bold text-xs tracking-widest rounded hover:bg-gold-light transition-colors"
            >
              COPY LINK
            </button>
            <button
              onClick={() => setShowJoinLink(false)}
              className="w-full py-2 mt-2 text-white/40 hover:text-white/70 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
