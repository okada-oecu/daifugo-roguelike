import { useState, useEffect } from 'react';
import { GameState, GameSettings, DEFAULT_GAME_SETTINGS, createEmptyAbilities } from './types';
import { createInitialPlayerDeck } from './utils/daifugo';
import { CombatView } from './components/CombatView';
import { ShopView } from './components/ShopView';
import { AbilitySelectView } from './components/AbilitySelectView';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { GameSettingsPanel } from './components/GameSettingsPanel';
import { RoomInfo } from './types/multiplayer';
import { socketService } from './services/socket';
import { ShieldAlert, Users, User, Settings } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    phase: 'menu',
    round: 1,
    scores: { player: 0, enemy1: 0, enemy2: 0, enemy3: 0 },
    ranks: { player: '平民', enemy1: '平民', enemy2: '平民', enemy3: '平民' },
    lastWinner: null,
    gold: 0,
    playerDeck: [],
    abilities: createEmptyAbilities(),
    ...DEFAULT_GAME_SETTINGS,
  });

  const [multiplayerRoom, setMultiplayerRoom] = useState<RoomInfo | null>(null);
  const [myActor, setMyActor] = useState<string>('player');
  const [isMultiplayerMode, setIsMultiplayerMode] = useState(false);
  const [disbandNotice, setDisbandNotice] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [soloSettings, setSoloSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem('daifugo_solo_settings');
      if (saved) return { ...DEFAULT_GAME_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore malformed saved settings
    }
    return DEFAULT_GAME_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('daifugo_solo_settings', JSON.stringify(soloSettings));
  }, [soloSettings]);

  useEffect(() => {
    socketService.connect();

    const unsubRoomUpdated = socketService.onRoomUpdated((updatedRoom) => {
      setMultiplayerRoom(updatedRoom);
    });

    const unsubGameStarted = socketService.onGameStarted(({ room: updatedRoom }) => {
      setMultiplayerRoom(updatedRoom);
      setGameState({
        phase: 'ability_select',
        round: 1,
        scores: { player: 0, enemy1: 0, enemy2: 0, enemy3: 0 },
        ranks: { player: '平民', enemy1: '平民', enemy2: '平民', enemy3: '平民' },
        lastWinner: null,
        gold: 0,
        playerDeck: createInitialPlayerDeck(),
        abilities: createEmptyAbilities(),
        ...(updatedRoom.settings || DEFAULT_GAME_SETTINGS),
      });
    });

    const unsubRoomDisbanded = socketService.onRoomDisbanded(({ reason }) => {
      setDisbandNotice(reason || '通信が切断されたため、対戦を終了してタイトルへ戻ります。');
      setMultiplayerRoom(null);
      setIsMultiplayerMode(false);
      setGameState(prev => ({ ...prev, phase: 'menu' }));
    });

    const unsubDisconnect = socketService.onDisconnect(() => {
      setDisbandNotice('サーバーとの通信が切断されたため、タイトル画面へ戻ります。');
      setMultiplayerRoom(null);
      setIsMultiplayerMode(false);
      setGameState(prev => ({ ...prev, phase: 'menu' }));
    });

    const unsubGameStateSynced = socketService.onGameStateSynced((syncedGameState) => {
      if (!syncedGameState) return;
      setMultiplayerRoom(prev => {
        if (!prev) return null;
        return { ...prev, gameState: syncedGameState };
      });
      setGameState(prev => {
        // Do not update main game state via socket if not in multiplayer mode
        if (!isMultiplayerMode && !multiplayerRoom) return prev;
        
        // Keep local phase intact once ability selection or a terminal (round-outcome)
        // phase is reached locally — each client reaches victory/gameover independently
        // based on its own actor's standing, so a later sync from another client's
        // (possibly different) outcome must not clobber it.
        let nextPhase = prev.phase;
        if (prev.phase === 'ability_select' || prev.phase === 'victory' || prev.phase === 'gameover') {
          nextPhase = prev.phase;
        } else if (syncedGameState.phase && syncedGameState.phase !== 'ability_select' && syncedGameState.phase !== 'multiplayer_lobby' && syncedGameState.phase !== 'menu') {
          nextPhase = syncedGameState.phase;
        }

        return {
          ...prev,
          ...syncedGameState,
          phase: nextPhase,
          scores: syncedGameState.scores || prev.scores,
          ranks: syncedGameState.ranks || prev.ranks,
          gold: syncedGameState.gold !== undefined ? syncedGameState.gold : prev.gold,
          round: syncedGameState.round || prev.round,
          // abilities is authoritatively merged per-actor server-side, so accept it as-is
          abilities: syncedGameState.abilities || prev.abilities
        };
      });
    });

    return () => {
      unsubRoomUpdated?.();
      unsubGameStarted?.();
      unsubRoomDisbanded?.();
      unsubDisconnect?.();
      unsubGameStateSynced?.();
    };
  }, []);

  const startSinglePlayer = () => {
    setIsMultiplayerMode(false);
    setMultiplayerRoom(null);
    setGameState({
      phase: 'ability_select',
      round: 1,
      scores: { player: 0, enemy1: 0, enemy2: 0, enemy3: 0 },
      ranks: { player: '平民', enemy1: '平民', enemy2: '平民', enemy3: '平民' },
      lastWinner: null,
      gold: 0,
      playerDeck: createInitialPlayerDeck(),
      abilities: createEmptyAbilities(),
      ...soloSettings,
    });
  };

  const startMultiplayerLobby = () => {
    setIsMultiplayerMode(true);
    setGameState(prev => ({ ...prev, phase: 'multiplayer_lobby' }));
  };

  const handleStartMultiplayerGame = (room: RoomInfo, actor: string) => {
    setMultiplayerRoom(room);
    setMyActor(actor);
    setGameState({
      phase: 'ability_select',
      round: 1,
      scores: { player: 0, enemy1: 0, enemy2: 0, enemy3: 0 },
      ranks: { player: '平民', enemy1: '平民', enemy2: '平民', enemy3: '平民' },
      lastWinner: null,
      gold: 0,
      playerDeck: createInitialPlayerDeck(),
      abilities: createEmptyAbilities(),
      ...(room.settings || DEFAULT_GAME_SETTINGS),
    });
  };

  return (
    <>
      {disbandNotice && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 font-pixel select-none animate-in fade-in">
          <div className="bg-[#0a0a0a] border-4 border-red-600 p-6 sm:p-8 max-w-sm w-full text-center space-y-5 shadow-[0_0_30px_rgba(220,38,38,0.4)] relative">
            <div className="w-12 h-12 bg-red-950 border-2 border-red-500 text-red-500 flex items-center justify-center mx-auto shadow-md">
              <ShieldAlert size={28} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest block">
                DISCONNECTED
              </span>
              <h3 className="text-xl font-extrabold text-white tracking-wider">対戦解散</h3>
            </div>
            <p className="text-xs text-zinc-300 bg-black border-2 border-zinc-800 p-3 leading-relaxed text-left font-sans">
              {disbandNotice}
            </p>
            <button
              onClick={() => setDisbandNotice(null)}
              className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest border-4 border-black shadow-[0_4px_0_#000] transition-transform active:translate-y-1 cursor-pointer"
            >
              OK [TITLE MENU]
            </button>
          </div>
        </div>
      )}

      {gameState.phase === 'menu' && (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-pixel select-none">
          <div className="max-w-md w-full bg-[#0a0a0a] border-4 border-[#333] p-6 sm:p-8 flex flex-col items-center space-y-6 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]">
            {/* Background Pixel Accent Lines */}
            <div className="absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:12px_12px] opacity-40 pointer-events-none"></div>

            {/* Title Header */}
            <div className="relative z-10 space-y-3 text-center">
              <div className="inline-block px-3 py-1 bg-red-600/20 border-2 border-red-500 text-red-400 text-xs font-bold tracking-widest animate-pulse">
                ROGUELIKE CARD BATTLE
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-wider text-amber-400 glitch-play-text drop-shadow-[0_4px_0_#000]">
                大富豪
                <span className="block text-xl sm:text-2xl mt-2 text-red-500 tracking-widest font-normal">
                  ROGUE
                </span>
              </h1>
              <p className="text-zinc-400 text-[11px] tracking-wider">
                手札を強化し、場を支配せよ
              </p>
            </div>

            {/* Rule Panel (Image Left Panel Style) */}
            <div className="relative z-10 w-full bg-black border-4 border-zinc-800 p-4 text-xs space-y-3">
              <div className="flex items-center justify-between border-b-2 border-zinc-800 pb-2">
                <span className="text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  [ GAME RULE ]
                </span>
                <span className="text-zinc-500 text-[10px]">{soloSettings.scoreLimit}pt VICTOR</span>
              </div>

              <div className="space-y-2 text-[11px] text-zinc-300">
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-2">
                  <span className="bg-amber-500 text-black px-1.5 py-0.5 font-bold text-[10px]">{soloSettings.scoreLimit}pt</span>
                  <span>{soloSettings.scoreLimit}pt先取で勝利！ (1位:3pt / 2位:2pt)</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-2">
                  <span className="bg-red-600 text-white px-1.5 py-0.5 font-bold text-[10px]">都</span>
                  <span>都落ち (前1位が逃すと即大貧民0pt)</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-2">
                  <span className="bg-sky-500 text-black px-1.5 py-0.5 font-bold text-[10px]">⏱</span>
                  <span>1ターン{soloSettings.turnTimeLimit}秒制限</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(prev => !prev)}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 hover:text-amber-400 border-t-2 border-zinc-800 pt-2 transition-colors cursor-pointer"
              >
                <Settings size={12} />
                <span>{isSettingsOpen ? 'ゲーム設定を閉じる ▲' : 'ゲーム設定を開く ▼'}</span>
              </button>

              {isSettingsOpen && (
                <div className="pt-1">
                  <GameSettingsPanel settings={soloSettings} onChange={setSoloSettings} />
                </div>
              )}
            </div>

            {/* Buttons (Retro Play / Multiplayer Style) */}
            <div className="relative z-10 w-full space-y-3">
              <button
                onClick={startSinglePlayer}
                className="w-full py-4 bg-red-600 hover:bg-red-500 active:translate-y-1 text-white font-bold text-sm tracking-widest border-4 border-black border-b-8 shadow-[0_4px_0_#000] flex items-center justify-center gap-3 transition-transform cursor-pointer"
              >
                <User size={18} className="text-white" />
                <span className="glitch-play-text text-yellow-300">SOLO PLAY</span>
              </button>

              <button
                onClick={startMultiplayerLobby}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 active:translate-y-1 text-amber-400 font-bold text-xs tracking-widest border-4 border-zinc-700 shadow-[0_4px_0_#000] flex items-center justify-center gap-3 transition-transform cursor-pointer"
              >
                <Users size={18} className="text-amber-400" />
                <span>MULTIPLAYER (対戦)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'multiplayer_lobby' && (
        <MultiplayerLobby
          room={multiplayerRoom}
          setRoom={setMultiplayerRoom}
          myActor={myActor}
          setMyActor={setMyActor}
          onBackToMenu={() => {
            setMultiplayerRoom(null);
            setGameState(prev => ({ ...prev, phase: 'menu' }));
          }}
          onStartMultiplayerGame={handleStartMultiplayerGame}
        />
      )}

      {gameState.phase === 'ability_select' && (
        <AbilitySelectView gameState={gameState} setGameState={setGameState} roomInfo={multiplayerRoom} myActor={myActor} />
      )}

      {gameState.phase === 'combat' && (
        <CombatView
          gameState={gameState}
          setGameState={setGameState}
          roomInfo={multiplayerRoom}
          myActor={myActor}
        />
      )}

      {gameState.phase === 'shop' && (
        <ShopView gameState={gameState} setGameState={setGameState} myActor={myActor} roomInfo={multiplayerRoom} />
      )}

      {gameState.phase === 'gameover' && (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-pixel select-none">
          <div className="text-center space-y-6 max-w-md w-full bg-[#0a0a0a] border-4 border-red-900 p-8 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <div className="text-red-500 mb-2">
              <ShieldAlert size={56} className="mx-auto text-red-600 animate-bounce" />
            </div>
            <h1 className="text-4xl font-extrabold text-red-500 tracking-wider glitch-play-text">
              GAME OVER
            </h1>
            <p className="text-xs tracking-wider text-zinc-400">
              CPUに先に {gameState.scoreLimit}pt を取られてしまった...
            </p>
            <div className="pt-4">
              <button
                onClick={() => setGameState(prev => ({ ...prev, phase: 'menu' }))}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white border-4 border-zinc-700 font-bold tracking-widest text-xs transition-transform active:translate-y-1 cursor-pointer"
              >
                TITLE MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'victory' && (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-pixel select-none">
          <div className="text-center space-y-6 max-w-md w-full bg-[#0a0a0a] border-4 border-amber-500 p-8 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <h1 className="text-4xl font-extrabold text-amber-400 tracking-wider glitch-play-text">
              VICTORY!
            </h1>
            <p className="text-xs tracking-wider text-amber-200/80">
              あなたは真の大富豪だ！
            </p>
            <div className="pt-4">
              <button
                onClick={() => setGameState(prev => ({ ...prev, phase: 'menu' }))}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black border-4 border-black font-bold tracking-widest text-xs transition-transform active:translate-y-1 cursor-pointer shadow-[0_4px_0_#000]"
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return null;
}
