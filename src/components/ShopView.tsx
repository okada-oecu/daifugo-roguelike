import React, { useState, useEffect } from 'react';
import { CardData, GameState, Ability } from '../types';
import { getShopCards } from '../utils/daifugo';
import { PlayingCard } from './PlayingCard';
import { ALL_STANDARD_ABILITIES, RARE_REVERSAL_ABILITIES } from '../data/abilities';
import { Trophy, Coins, ArrowRight, Trash2, Sparkles, Zap, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RoomInfo } from '../types/multiplayer';
import { socketService } from '../services/socket';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShopViewProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  myActor?: string;
  roomInfo?: RoomInfo | null;
}

export function ShopView({ gameState, setGameState, myActor = 'player', roomInfo }: ShopViewProps) {
  const [shopCards, setShopCards] = useState<CardData[]>(() => getShopCards(gameState.playerDeck));
  const [selectedToRemove, setSelectedToRemove] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [readyStatus, setReadyStatus] = useState<{ readyCount: number; totalCount: number } | null>(null);

  const actorKey = (['player', 'enemy1', 'enemy2', 'enemy3'].includes(myActor) ? myActor : 'player') as keyof typeof gameState.ranks;
  const myRank = gameState.ranks[actorKey] || '平民';
  const myScore = gameState.scores[actorKey] || 0;
  const isPlayerDaihingo = myRank === '大貧民';

  // Generate ability offer for the shop
  const [abilityOffers, setAbilityOffers] = useState<Ability[]>([]);

  const myAbilities = gameState.abilities[actorKey] || [];

  useEffect(() => {
    const ownedIds = new Set(myAbilities.map(a => a.id));
    const availableStandard = ALL_STANDARD_ABILITIES.filter(a => !ownedIds.has(a.id));
    const availableRare = RARE_REVERSAL_ABILITIES.filter(a => !ownedIds.has(a.id));

    const offers: Ability[] = [];

    // If player is Daihingo, guarantee a Rare Reversal Ability if available!
    if (isPlayerDaihingo && availableRare.length > 0) {
      const rareIndex = Math.floor(Math.random() * availableRare.length);
      offers.push(availableRare[rareIndex]);
    }

    // Fill remaining slots with standard abilities up to 2 items
    const shuffledStandard = [...availableStandard].sort(() => Math.random() - 0.5);
    while (offers.length < 2 && shuffledStandard.length > 0) {
      const next = shuffledStandard.pop();
      if (next) offers.push(next);
    }

    setAbilityOffers(offers);
  }, [myRank, gameState.abilities]);

  useEffect(() => {
    if (roomInfo) {
      const unsubReadyUpdated = socketService.onPhaseReadyUpdated(({ phase, readyCount, totalCount }) => {
        if (phase === 'shop') {
          setReadyStatus({ readyCount, totalCount });
        }
      });

      const unsubAllReady = socketService.onAllPlayersPhaseReady(({ phase }) => {
        if (phase === 'shop') {
          setGameState(prev => ({
            ...prev,
            round: prev.round + 1,
            phase: 'combat'
          }));
        }
      });

      return () => {
        unsubReadyUpdated?.();
        unsubAllReady?.();
      };
    }
  }, [roomInfo, setGameState]);

  const buyCard = (card: CardData, index: number) => {
    if (isWaiting) return;
    if (gameState.gold >= 10) {
      setGameState(prev => ({
        ...prev,
        gold: prev.gold - 10,
        playerDeck: [...prev.playerDeck, card]
      }));
      setShopCards(prev => prev.filter((_, i) => i !== index));
    }
  };

  const buyAbility = (ability: Ability) => {
    if (isWaiting) return;
    const cost = ability.price || 30;
    if (gameState.gold >= cost) {
      const updatedMine = [...(gameState.abilities[actorKey] || []), { ...ability, isUsed: false }];
      setGameState(prev => ({
        ...prev,
        gold: prev.gold - cost,
        abilities: { ...prev.abilities, [actorKey]: updatedMine }
      }));
      if (roomInfo) {
        socketService.syncGameState({ abilities: { [actorKey]: updatedMine } });
      }
      setAbilityOffers(prev => prev.filter(a => a.id !== ability.id));
    }
  };

  const removeCard = () => {
    if (isWaiting) return;
    if (selectedToRemove && gameState.gold >= 20) {
      setGameState(prev => ({
        ...prev,
        gold: prev.gold - 20,
        playerDeck: prev.playerDeck.filter(c => c.id !== selectedToRemove)
      }));
      setSelectedToRemove(null);
    }
  };

  const proceed = () => {
    if (roomInfo) {
      setIsWaiting(true);
      socketService.sendPhaseReady('shop');
    } else {
      setGameState(prev => ({
        ...prev,
        round: prev.round + 1,
        phase: 'combat'
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-slate-200 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-white/10 bg-black/40 flex items-center justify-between px-4 md:px-8 shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold hidden md:block">エリア</span>
            <span className="text-lg md:text-xl font-serif italic">闇の取引所 & ショップ</span>
          </div>
          <div className="h-8 w-px bg-white/10 hidden md:block"></div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 hidden md:block">進行</span>
            <span className="text-base md:text-lg font-mono">第 {gameState.round} ラウンド準備</span>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/20 px-2 md:px-3 py-1 rounded">
            <span className="text-amber-500"><Coins size={16} /></span>
            <span className="text-base md:text-lg font-mono font-bold">{gameState.gold}G</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 px-2 md:px-3 py-1 rounded">
            <span className="text-amber-400"><Trophy size={16} /></span>
            <span className="text-base md:text-lg font-mono font-bold text-amber-300">My Score: {myScore} / 12pt ({myRank})</span>
          </div>
        </div>
      </div>

      {/* Special Banner for Daihingo */}
      {isPlayerDaihingo && (
        <div className="bg-gradient-to-r from-purple-900/60 via-red-900/60 to-purple-900/60 border-b border-purple-500/40 py-2.5 px-4 text-center flex items-center justify-center gap-2 animate-pulse">
          <Sparkles className="text-purple-300" size={18} />
          <span className="text-xs md:text-sm font-bold tracking-widest text-purple-200">
            【大貧民特権】一撃逆転の超絶秘伝能力が出現中！格安で獲得して下剋上を果たせ！
          </span>
          <Sparkles className="text-purple-300" size={18} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-6xl mx-auto w-full custom-scrollbar">
        
        {/* Top Section: Abilities & Playing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Ability Shop Section */}
          <div className="space-y-4 bg-black/30 p-5 rounded-2xl border border-white/10">
            <div className="border-b border-white/10 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[10px] uppercase tracking-tighter text-amber-500 font-bold">能力獲得</h3>
                <h2 className="text-xl md:text-2xl font-serif italic text-slate-100 flex items-center gap-2">
                  <Zap className="text-amber-400" size={20} /> 特殊能力を購入
                </h2>
              </div>
              <span className="text-xs text-slate-400">所持能力: {myAbilities.length} 個</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {abilityOffers.map(ability => {
                const cost = ability.price || 30;
                const canAfford = gameState.gold >= cost;
                return (
                  <div 
                    key={ability.id} 
                    className={cn(
                      "p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all",
                      ability.isRare 
                        ? "bg-gradient-to-r from-purple-950/50 to-red-950/50 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.2)]" 
                        : "bg-black/40 border-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-bold text-sm", ability.isRare ? "text-purple-300 font-serif" : "text-amber-300")}>
                            {ability.name}
                          </span>
                          {ability.isRare && (
                            <span className="px-2 py-0.5 bg-purple-500 text-black text-[10px] font-black rounded-full uppercase tracking-wider">
                              UR 逆転秘伝
                            </span>
                          )}
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border",
                            ability.type === 'passive' 
                              ? "bg-blue-900/40 border-blue-500/40 text-blue-300"
                              : "bg-red-900/40 border-red-500/40 text-red-300"
                          )}>
                            {ability.type === 'passive' ? '常時発動' : '使い切り'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{ability.description}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                        <Coins size={14} /> {cost}G
                      </span>
                      <button
                        disabled={!canAfford || isWaiting}
                        onClick={() => buyAbility(ability)}
                        className={cn(
                          "px-4 py-1.5 rounded-full font-bold text-xs tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed",
                          ability.isRare
                            ? "bg-purple-600 hover:bg-purple-500 text-white border border-purple-400 disabled:opacity-40"
                            : "bg-amber-600 hover:bg-amber-500 text-black border border-amber-400 disabled:opacity-40"
                        )}
                      >
                        習得する
                      </button>
                    </div>
                  </div>
                );
              })}

              {abilityOffers.length === 0 && (
                <div className="text-slate-500 italic py-6 text-center text-xs">
                  すべての能力を閲覧・習得済みです
                </div>
              )}
            </div>
          </div>

          {/* Playing Cards Shop Section */}
          <div className="space-y-4 bg-black/30 p-5 rounded-2xl border border-white/10">
            <div className="border-b border-white/10 pb-3">
              <h3 className="text-[10px] uppercase tracking-tighter text-amber-500 font-bold">手札補強</h3>
              <h2 className="text-xl md:text-2xl font-serif italic text-amber-400">カードを購入する (10G)</h2>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4">
              {shopCards.map((card, i) => (
                <div key={card.id} className="flex flex-col items-center gap-2 transform hover:scale-105 transition-transform">
                  <PlayingCard card={card} />
                  <button
                    disabled={gameState.gold < 10 || isWaiting}
                    onClick={() => buyCard(card, i)}
                    className="px-4 py-1.5 bg-slate-800 border border-white/20 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 rounded-full font-bold tracking-widest text-[11px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    10G 購入
                  </button>
                </div>
              ))}
              {shopCards.length === 0 && (
                <div className="text-slate-500 italic py-8 font-serif w-full text-center">売り切れ</div>
              )}
            </div>
          </div>

        </div>

        {/* Deck Management (Remove Cards) */}
        <div className="space-y-4 bg-black/20 p-5 md:p-6 rounded-2xl border border-white/5">
          <div className="flex justify-between items-end border-b border-white/10 pb-3">
            <div>
              <h3 className="text-[10px] uppercase tracking-tighter text-slate-500">デッキ圧縮</h3>
              <h2 className="text-xl md:text-2xl font-serif italic text-slate-300">不要カードを除外 (20G)</h2>
            </div>
            <button
              disabled={!selectedToRemove || gameState.gold < 20 || isWaiting}
              onClick={removeCard}
              className="px-4 py-1.5 bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50 hover:text-red-300 disabled:opacity-40 rounded-full font-bold tracking-widest text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Trash2 size={14} /> <span>カードを処分</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto p-2 justify-center custom-scrollbar">
            {[...gameState.playerDeck].sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit)).map(card => (
              <div key={card.id} className="relative transform scale-75 md:scale-90 origin-top">
                <PlayingCard
                  card={card}
                  isSelected={selectedToRemove === card.id}
                  onClick={() => !isWaiting && setSelectedToRemove(card.id)}
                />
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="h-20 border-t border-white/10 bg-black/40 flex items-center justify-center md:justify-end px-8 shrink-0">
        <button 
          onClick={proceed}
          disabled={isWaiting}
          className="w-full md:w-auto px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black rounded-full font-bold tracking-widest text-sm flex justify-center items-center gap-2 transition-colors shadow-lg shadow-amber-900/20 border border-amber-400 disabled:border-zinc-700 cursor-pointer disabled:cursor-not-allowed"
        >
          {isWaiting ? (
            <>
              <Loader2 className="animate-spin" size={16} /> 対戦相手を待機中...
            </>
          ) : (
            <>
              次のラウンドを開始する <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {/* Waiting Overlay Modal for Multiplayer */}
      {isWaiting && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 font-pixel select-none">
          <div className="bg-[#0a0a0a] border-4 border-amber-500 p-6 sm:p-8 max-w-sm w-full text-center space-y-6 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-in fade-in">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-amber-500/30 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <Sparkles className="text-amber-400" size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-amber-400 tracking-wider">対戦相手を待機中</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                他のプレイヤーがショップを利用中です。<br />全員の準備が完了すると次のラウンドが始まります。
              </p>
            </div>
            <div className="bg-zinc-950 border-2 border-zinc-800 p-3 flex items-center justify-between font-mono">
              <span className="text-xs font-bold text-zinc-400">準備完了</span>
              <span className="text-sm font-bold text-amber-400">
                {readyStatus ? `${readyStatus.readyCount} / ${readyStatus.totalCount}` : '確認中...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

