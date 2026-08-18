import React, { useState, useEffect } from 'react';
import { RoomInfo, ChatMessage } from '../types/multiplayer';
import { socketService } from '../services/socket';
import { createAllFourHands } from '../utils/daifugo';
import { MultiplayerChat } from './MultiplayerChat';
import { Users, Copy, Check, Play, ArrowLeft, Shield, Crown, Sparkles, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface MultiplayerLobbyProps {
  room: RoomInfo | null;
  setRoom: React.Dispatch<React.SetStateAction<RoomInfo | null>>;
  myActor: string;
  setMyActor: (actor: string) => void;
  onBackToMenu: () => void;
  onStartMultiplayerGame: (room: RoomInfo, myActor: string) => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  room,
  setRoom,
  myActor,
  setMyActor,
  onBackToMenu,
  onStartMultiplayerGame
}) => {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('daifugo_player_name') || `プレイヤー_${Math.floor(Math.random() * 899 + 100)}`;
  });
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('daifugo_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    socketService.connect();
  }, []);

  const handleCreateRoom = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await socketService.createRoom(playerName);
    setIsLoading(false);

    if (res.success && res.room && res.playerActor) {
      setRoom(res.room);
      setMyActor(res.playerActor);
    } else {
      setErrorMsg(res.error || 'ルーム作成に失敗しました。');
    }
  };

  const handleJoinRoom = async () => {
    if (!inputRoomCode.trim()) {
      setErrorMsg('ルームコードを入力してください。');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    const res = await socketService.joinRoom(inputRoomCode, playerName);
    setIsLoading(false);

    if (res.success && res.room && res.playerActor) {
      setRoom(res.room);
      setMyActor(res.playerActor);
    } else {
      setErrorMsg(res.error || 'ルーム参加に失敗しました。');
    }
  };

  const handleLeaveRoom = () => {
    socketService.leaveRoom();
    setRoom(null);
    setErrorMsg(null);
  };

  const handleToggleReady = () => {
    socketService.toggleReady();
  };

  const handleStartGame = () => {
    if (!room) return;
    
    // Check if host
    const me = room.players.find(p => p.actor === myActor);
    if (!me?.isHost) return;

    // Create initial game state for multiplayer session
    const initialHands = createAllFourHands();
    const initialGameState = {
      phase: 'ability_select',
      round: 1,
      scores: { player: 0, enemy1: 0, enemy2: 0, enemy3: 0 },
      ranks: { player: '平民', enemy1: '平民', enemy2: '平民', enemy3: '平民' },
      lastWinner: null,
      gold: 0,
      abilities: [],
      hands: initialHands,
    };

    socketService.startGame(initialGameState);
  };

  const copyRoomCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const me = room?.players.find(p => p.actor === myActor);
  const isHost = me?.isHost || false;
  const allNonHostsReady = room ? room.players.filter(p => !p.isHost).every(p => p.isReady) : false;

  // Render Room Code Entry / Creation screen if not inside a room
  if (!room) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-pixel select-none relative overflow-hidden">
        <div className="max-w-md w-full bg-[#0a0a0a] border-4 border-zinc-800 p-6 md:p-8 space-y-6 relative z-10 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between border-b-2 border-zinc-800 pb-4">
            <button 
              onClick={onBackToMenu}
              className="flex items-center gap-2 text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} /> TITLE MENU
            </button>
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <Users size={16} />
              <span>ONLINE LOBBY</span>
            </div>
          </div>

          {/* Player Name Input */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
              PLAYER NAME
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
              placeholder="名前を入力..."
              className="w-full bg-zinc-950 border-4 border-zinc-800 p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-pixel"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-950 border-2 border-red-500 text-red-300 p-2 text-[10px] text-center font-bold">
              {errorMsg}
            </div>
          )}

          {/* Action Choice: Create or Join */}
          <div className="space-y-4 pt-2">
            <button
              onClick={handleCreateRoom}
              disabled={isLoading || !playerName.trim()}
              className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:bg-zinc-900 text-white disabled:text-zinc-600 font-bold text-xs tracking-widest border-4 border-black disabled:border-zinc-800 shadow-[0_4px_0_#000] flex items-center justify-center gap-2 transition-transform active:translate-y-1 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
              <span>CREATE ROOM</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t-2 border-zinc-800"></div>
              <span className="flex-shrink mx-3 text-[10px] text-zinc-500 uppercase tracking-widest">OR</span>
              <div className="flex-grow border-t-2 border-zinc-800"></div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                JOIN BY ROOM CODE
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputRoomCode}
                  onChange={(e) => setInputRoomCode(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="CODE"
                  className="flex-1 bg-zinc-950 border-4 border-zinc-800 p-2 text-xs text-center font-mono text-amber-300 font-bold tracking-widest focus:outline-none focus:border-amber-500 uppercase font-pixel"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={isLoading || !inputRoomCode.trim() || !playerName.trim()}
                  className="px-5 py-2 bg-zinc-900 border-4 border-zinc-700 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 font-bold text-xs tracking-wider transition-colors cursor-pointer"
                >
                  JOIN
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inside Room Lobby
  const actorNames: Record<string, string> = {
    player: '枠 1 (ホスト)',
    enemy1: '枠 2',
    enemy2: '枠 3',
    enemy3: '枠 4'
  };

  const actorList: ('player' | 'enemy1' | 'enemy2' | 'enemy3')[] = ['player', 'enemy1', 'enemy2', 'enemy3'];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-pixel select-none relative overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b-4 border-zinc-800 bg-[#0a0a0a] flex items-center justify-between px-4 md:px-8 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeaveRoom}
            className="p-2 bg-zinc-900 border-2 border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
            title="ルームを退室"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xs font-bold text-amber-400">LOBBY WAITING</h1>
            <p className="text-[9px] text-zinc-500">プレイヤー待機中 (不足枠はCPU)</p>
          </div>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-2 bg-zinc-950 border-2 border-amber-500 px-3 py-1">
          <span className="text-[10px] text-zinc-400">CODE:</span>
          <span className="font-mono font-bold text-amber-300 text-sm tracking-widest">{room.code}</span>
          <button
            onClick={copyRoomCode}
            className="p-1 hover:bg-amber-500/20 text-amber-400 transition-colors ml-1 cursor-pointer"
            title="コードをコピー"
          >
            {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Main Lobby Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col justify-between space-y-6">
        
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-amber-400 glitch-play-text">参加プレイヤー一覧 (最大4人)</h2>
            <p className="text-[10px] text-zinc-400">空き枠には自動的にAI（CPU）が参加します</p>
          </div>

          {/* Slots 1-4 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {actorList.map((actor, idx) => {
              const p = room.players.find(item => item.actor === actor);

              return (
                <div
                  key={actor}
                  className={cn(
                    "p-4 border-4 flex items-center justify-between transition-all",
                    p 
                      ? p.isHost 
                        ? "bg-amber-950/30 border-amber-500" 
                        : "bg-zinc-950 border-zinc-800"
                      : "bg-black border-zinc-900 border-dashed text-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 flex items-center justify-center font-bold text-xs border-2",
                      p 
                        ? p.isHost ? "bg-amber-500 text-black border-black" : "bg-zinc-800 text-amber-300 border-zinc-600" 
                        : "bg-zinc-950 text-zinc-700 border-zinc-900"
                    )}>
                      {p ? p.name.charAt(0).toUpperCase() : (idx + 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-bold text-xs", p ? "text-zinc-100" : "text-zinc-600")}>
                          {p ? p.name : `CPU (AI)`}
                        </span>
                        {p?.isHost && (
                          <span className="flex items-center gap-1 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500 px-1.5 py-0.5 font-bold">
                            <Crown size={10} /> HOST
                          </span>
                        )}
                        {p?.actor === myActor && (
                          <span className="text-[9px] bg-sky-950 text-sky-300 border border-sky-500 px-1.5 py-0.5 font-bold">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-zinc-500">SEAT {idx + 1}</span>
                    </div>
                  </div>

                  {/* Ready Status indicator */}
                  {p && !p.isHost && (
                    <div className={cn(
                      "px-2.5 py-1 text-[9px] font-bold tracking-wider border",
                      p.isReady 
                        ? "bg-emerald-950 text-emerald-400 border-emerald-500" 
                        : "bg-zinc-900 text-zinc-500 border-zinc-700"
                    )}>
                      {p.isReady ? 'READY' : 'WAITING'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Controls & Chat button */}
        <div className="border-t-4 border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="flex items-center gap-2 text-xs text-amber-400 bg-zinc-900 border-2 border-amber-500 px-4 py-3 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <MessageSquare size={16} />
            <span>CHAT ({room.chatMessages.length})</span>
          </button>

          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={room.players.length > 1 && !allNonHostsReady}
              className="w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-500 disabled:bg-zinc-900 text-white disabled:text-zinc-600 font-bold text-xs tracking-widest border-4 border-black disabled:border-zinc-800 shadow-[0_4px_0_#000] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Play size={16} fill="currentColor" />
              <span>START GAME [PLAY]</span>
            </button>
          ) : (
            <button
              onClick={handleToggleReady}
              className={cn(
                "w-full sm:w-auto px-10 py-4 font-bold text-xs tracking-widest border-4 border-black shadow-[0_4px_0_#000] flex items-center justify-center gap-2 cursor-pointer",
                me?.isReady
                  ? "bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white border-black"
              )}
            >
              <span>{me?.isReady ? 'CANCEL READY' : 'READY!'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Embedded Chat Modal/Drawer */}
      <MultiplayerChat
        chatMessages={room.chatMessages}
        myActor={myActor}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
};
