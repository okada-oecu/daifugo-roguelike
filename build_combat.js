const fs = require('fs');

let code = `import React, { useState, useEffect } from 'react';
import { CardData, GameState, Play, TurnState, Rank, Suit, Actor } from '../types';
import { createEnemyHands, evaluatePlay, canPlay, getAIOptimalPlay } from '../utils/daifugo';
import { PlayingCard } from './PlayingCard';
import { Heart, ShieldAlert, Swords, Coins } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CombatViewProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

const ACTORS: Actor[] = ['player', 'enemy1', 'enemy2', 'enemy3'];

export function CombatView({ gameState, setGameState }: CombatViewProps) {
  const [hands, setHands] = useState<Record<Actor, CardData[]>>(() => {
    const enemyDecks = createEnemyHands(gameState.floor, gameState.playerDeck);
    return {
      player: [...gameState.playerDeck].sort((a,b) => a.rank - b.rank),
      enemy1: enemyDecks.enemy1,
      enemy2: enemyDecks.enemy2,
      enemy3: enemyDecks.enemy3,
    };
  });
  
  const [trick, setTrick] = useState<Play[]>([]);
  const [trickOwner, setTrickOwner] = useState<Actor | null>(null);
  const [passedActors, setPassedActors] = useState<Set<Actor>>(new Set());
  
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg].slice(-5));
  };
  
  const [turn, setTurn] = useState<TurnState>('player');
  const [nextTurnAfterSpecial, setNextTurnAfterSpecial] = useState<TurnState | null>(null);
  const [passCount7, setPassCount7] = useState<number>(0);
  const [discardCount10, setDiscardCount10] = useState<number>(0);
  
  const [isRevolution, setIsRevolution] = useState(false);
  const [is11Back, setIs11Back] = useState(false);
  
  const isReversed = isRevolution !== is11Back;
  const currentTopPlay = trick.length > 0 ? trick[trick.length - 1] : null;

  const getPlayTypeName = (type: Play['type']) => {
    switch(type) {
      case 'Single': return '単発';
      case 'Group': return 'ペア';
      case 'Sequence': return '階段';
      default: return type;
    }
  };
  
  const getNextActor = (current: Actor): Actor => {
    const idx = ACTORS.indexOf(current);
    return ACTORS[(idx + 1) % 4];
  };

  useEffect(() => {
    if (hands.player.length === 0 && (hands.enemy1.length > 0 || hands.enemy2.length > 0 || hands.enemy3.length > 0)) {
      // Player wins
      const remainingEnemyCards = hands.enemy1.length + hands.enemy2.length + hands.enemy3.length;
      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          gold: prev.gold + 50 + (remainingEnemyCards * 5),
          phase: prev.floor >= 10 ? 'victory' : 'shop'
        }));
      }, 1500);
    } else if (hands.enemy1.length === 0 || hands.enemy2.length === 0 || hands.enemy3.length === 0) {
      // Enemy wins round, player takes damage
      if (hands.player.length > 0) {
        const damage = hands.player.length * 5;
        setTimeout(() => {
          setGameState(prev => {
            const newHp = prev.playerHp - damage;
            return {
              ...prev,
              playerHp: newHp,
              phase: newHp <= 0 ? 'gameover' : 'shop'
            };
          });
        }, 1500);
      }
    }
  }, [hands, setGameState, gameState.floor]);

  // AI Turn Logic
  useEffect(() => {
    if (['enemy1', 'enemy2', 'enemy3'].includes(turn as string) && hands[turn as Actor].length > 0 && hands.player.length > 0) {
      const currentActor = turn as Actor;
      
      const timer = setTimeout(() => {
        // If everyone else passed, trick is cleared
        if (trickOwner === currentActor) {
          setTrick([]);
          setIs11Back(false);
          setPassedActors(new Set());
          setTrickOwner(null);
          // AI can now play anything
          const aiPlay = getAIOptimalPlay(hands[currentActor], isReversed, null);
          if (aiPlay) {
            executePlay(aiPlay, currentActor);
          } else {
            handlePass(currentActor);
          }
          return;
        }

        const aiPlay = getAIOptimalPlay(hands[currentActor], isReversed, currentTopPlay);
        
        if (aiPlay) {
          executePlay(aiPlay, currentActor);
        } else {
          handlePass(currentActor);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
    
    if ((turn === 'enemy1_pass_7' || turn === 'enemy2_pass_7' || turn === 'enemy3_pass_7') && hands.player.length > 0) {
      const currentActor = turn.split('_')[0] as Actor;
      if (hands[currentActor].length === 0) {
         setTurn(nextTurnAfterSpecial || getNextActor(currentActor));
         setNextTurnAfterSpecial(null);
         setPassCount7(0);
         return;
      }
      const timer = setTimeout(() => {
        const sorted = [...hands[currentActor]].sort((a,b) => {
          const sA = isReversed ? 18 - a.rank : a.rank;
          const sB = isReversed ? 18 - b.rank : b.rank;
          return sA - sB; 
        });
        const cardsToPass = sorted.slice(0, passCount7);
        const passIds = new Set(cardsToPass.map(c => c.id));
        
        setHands(prev => ({
          ...prev,
          [currentActor]: prev[currentActor].filter(c => !passIds.has(c.id)),
          player: [...prev.player, ...cardsToPass].sort((a,b) => a.rank - b.rank)
        }));
        
        setTurn(nextTurnAfterSpecial || getNextActor(currentActor));
        setNextTurnAfterSpecial(null);
        setPassCount7(0);
      }, 1000);
      return () => clearTimeout(timer);
    }

    if ((turn === 'enemy1_discard_10' || turn === 'enemy2_discard_10' || turn === 'enemy3_discard_10') && hands.player.length > 0) {
      const currentActor = turn.split('_')[0] as Actor;
      if (hands[currentActor].length === 0) {
         setTurn(nextTurnAfterSpecial || getNextActor(currentActor));
         setNextTurnAfterSpecial(null);
         setDiscardCount10(0);
         return;
      }
      const timer = setTimeout(() => {
        const sorted = [...hands[currentActor]].sort((a,b) => {
          const sA = isReversed ? 18 - a.rank : a.rank;
          const sB = isReversed ? 18 - b.rank : b.rank;
          return sA - sB;
        });
        const cardsToDiscard = sorted.slice(0, Math.min(discardCount10, sorted.length));
        const discardIds = new Set(cardsToDiscard.map(c => c.id));
        
        setHands(prev => ({
          ...prev,
          [currentActor]: prev[currentActor].filter(c => !discardIds.has(c.id))
        }));
        
        setTurn(nextTurnAfterSpecial || getNextActor(currentActor));
        setNextTurnAfterSpecial(null);
        setDiscardCount10(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [turn, hands, isReversed, currentTopPlay, passCount7, discardCount10, nextTurnAfterSpecial, trickOwner]);

  const executePlay = (play: Play, actor: Actor) => {
    const playIds = new Set(play.cards.map(c => c.id));
    setHands(prev => ({
      ...prev,
      [actor]: prev[actor].filter(c => !playIds.has(c.id))
    }));
    
    if (actor === 'player') {
      setSelectedIds(new Set());
    }

    setTrick(prev => [...prev, play]);
    setTrickOwner(actor);
    
    const newPassedActors = new Set(passedActors);
    newPassedActors.delete(actor);
    setPassedActors(newPassedActors);

    const playName = getPlayTypeName(play.type);
    const actorName = actor === 'player' ? 'あなた' : actor === 'enemy1' ? '敵1' : actor === 'enemy2' ? '敵2' : '敵3';
    addLog(\`\${actorName}が \${playName} を出しました。\`);
    if (play.isRevolution) addLog(\`革命発動！\`);
    if (play.has11) addLog(\`11バック発動！\`);

    let isTrickCleared = false;
    let baseNextTurn: TurnState = getNextActor(actor);

    if (play.isRevolution) setIsRevolution(prev => !prev);
    if (play.has11) setIs11Back(true);
    
    if (play.has8) {
      addLog(\`8切り！\`);
      isTrickCleared = true;
      baseNextTurn = actor;
    }
    
    let specialTurn: TurnState | null = null;
    if (play.has10) {
      addLog(\`10捨て発動！\`);
      specialTurn = \`\${actor}_discard_10\` as TurnState;
      const hasExtraDiscard = actor === 'player' && gameState.abilities.some(a => a.id === 'extra_discard');
      setDiscardCount10(play.count10 + (hasExtraDiscard ? 1 : 0));
    } else if (play.has7) {
      specialTurn = \`\${actor}_pass_7\` as TurnState;
      setPassCount7(play.count7);
    }

    if (specialTurn) {
      setNextTurnAfterSpecial(baseNextTurn);
    }

    if (isTrickCleared) {
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        setTrickOwner(actor);
        setTurn(specialTurn || baseNextTurn);
      }, 1200);
    } else {
      setTurn(specialTurn || baseNextTurn);
    }
  };

  const handlePass = (actor: Actor) => {
    const actorName = actor === 'player' ? 'あなた' : actor === 'enemy1' ? '敵1' : actor === 'enemy2' ? '敵2' : '敵3';
    addLog(\`\${actorName}がパスしました。\`);
    
    const newPassedActors = new Set(passedActors);
    newPassedActors.add(actor);
    setPassedActors(newPassedActors);
    
    if (actor === 'player') {
      setSelectedIds(new Set());
    }

    let next = getNextActor(actor);
    
    if (newPassedActors.size >= 3 && trickOwner !== null) {
      addLog(\`場が流れました。\`);
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        setTurn(trickOwner);
      }, 1200);
    } else {
      setTurn(next);
    }
  };

  const toggleCardSelection = (id: string) => {
    if (turn !== 'player' && turn !== 'player_pass_7' && turn !== 'player_discard_10') return;
    
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      if (turn === 'player_pass_7' && newSelected.size >= passCount7) return;
      if (turn === 'player_discard_10' && newSelected.size >= discardCount10) return;
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const attemptPlayerPlay = () => {
    const selectedCards = hands.player.filter(c => selectedIds.has(c.id));
    const hasThreeCardRevolution = gameState.abilities.some(a => a.id === 'three_card_revolution');
    const play = evaluatePlay(selectedCards, isReversed, hasThreeCardRevolution);
    
    if (play && canPlay(play, currentTopPlay, isReversed)) {
      executePlay(play, 'player');
    }
  };

  const attemptPlayerPass7 = () => {
    if (selectedIds.size === passCount7) {
      const selectedCards = hands.player.filter(c => selectedIds.has(c.id));
      setHands(prev => ({
        ...prev,
        player: prev.player.filter(c => !selectedIds.has(c.id)),
        enemy1: [...prev.enemy1, ...selectedCards] // pass to next player (enemy1)
      }));
      setSelectedIds(new Set());
      setTurn(nextTurnAfterSpecial || getNextActor('player'));
      setNextTurnAfterSpecial(null);
      setPassCount7(0);
    }
  };

  const attemptPlayerDiscard10 = () => {
    if (selectedIds.size > 0 && selectedIds.size <= discardCount10) {
      setHands(prev => ({
        ...prev,
        player: prev.player.filter(c => !selectedIds.has(c.id))
      }));
      setSelectedIds(new Set());
      setTurn(nextTurnAfterSpecial || getNextActor('player'));
      setNextTurnAfterSpecial(null);
      setDiscardCount10(0);
    }
  };

  const handleActiveAbility = (abilityId: string) => {
    if (turn !== 'player') return;
    
    setGameState(prev => ({
      ...prev,
      abilities: prev.abilities.map(a => a.id === abilityId ? { ...a, isUsed: true } : a)
    }));

    if (abilityId === 'skip_turn') {
      addLog(\`【威圧】敵のターンを強制パス！\`);
      handlePass('enemy1'); // simplistic skip
    } else if (abilityId === 'draw_cards') {
      addLog(\`【ドロー】カードを2枚引いた！\`);
      const newCards: CardData[] = [
        { id: \`draw_1_\${Date.now()}\`, suit: '♠', rank: Math.floor(Math.random() * 13) + 3 as Rank },
        { id: \`draw_2_\${Date.now()}\`, suit: '♥', rank: Math.floor(Math.random() * 13) + 3 as Rank }
      ];
      setHands(prev => ({
        ...prev,
        player: [...prev.player, ...newCards].sort((a,b) => a.rank - b.rank)
      }));
    } else if (abilityId === 'strong_draw') {
      addLog(\`【豪運】強カードを2枚引いた！\`);
      const newCards: CardData[] = [
        { id: \`sdraw_1_\${Date.now()}\`, suit: '♦', rank: Math.floor(Math.random() * 6) + 10 as Rank },
        { id: \`sdraw_2_\${Date.now()}\`, suit: '♣', rank: Math.floor(Math.random() * 6) + 10 as Rank }
      ];
      setHands(prev => ({
        ...prev,
        player: [...prev.player, ...newCards].sort((a,b) => a.rank - b.rank)
      }));
    }
  };

  const selectedCards = hands.player.filter(c => selectedIds.has(c.id));
  const hasThreeCardRevolution = gameState.abilities.some(a => a.id === 'three_card_revolution');
  const proposedPlay = evaluatePlay(selectedCards, isReversed, hasThreeCardRevolution);
  let isValid = false;
  if (proposedPlay) {
    if (trickOwner === 'player') {
      isValid = true; // Can play anything if we own the trick
    } else {
      isValid = canPlay(proposedPlay, currentTopPlay, isReversed);
    }
  }

  return (
    <div className={cn(
      "min-h-screen flex flex-col font-sans transition-colors duration-700 overflow-hidden",
      isRevolution ? "bg-[#1a0a0a] text-red-50" : is11Back ? "bg-[#0a1a1a] text-cyan-50" : "bg-[#0a0a0b] text-slate-200"
    )}>
      {/* Header Info */}
      <div className="h-16 border-b border-white/10 bg-black/40 flex items-center justify-between px-4 sm:px-8 shrink-0 z-20">
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold hidden sm:block">現在地</span>
            <span className="text-lg sm:text-xl font-serif italic">戦闘 (4人)</span>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 hidden sm:block">階層</span>
            <span className="text-base sm:text-lg font-mono">第 {gameState.floor} 階層</span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/20 px-2 sm:px-3 py-1 rounded">
            <span className="text-amber-500"><Coins size={16} /></span>
            <span className="text-base sm:text-lg font-mono font-bold">{gameState.gold}</span>
          </div>
          <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 px-2 sm:px-3 py-1 rounded">
            <span className="text-emerald-500"><Heart size={16} /></span>
            <span className="text-base sm:text-lg font-mono font-bold">{gameState.playerHp}/{gameState.maxHp}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Sidebar: Active Rules */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/10 bg-black/20 p-4 md:p-6 flex flex-row md:flex-col gap-4 md:gap-6 shrink-0 overflow-x-auto md:overflow-visible z-20">
          <div className="flex-1">
            <h3 className="text-[10px] sm:text-xs uppercase tracking-tighter text-slate-500 mb-2 md:mb-4 whitespace-nowrap">発動中のルール</h3>
            <div className="flex flex-row md:flex-col gap-2">
              <div className={cn("flex items-center gap-3 p-1.5 md:p-2 border rounded transition-opacity shrink-0", is11Back ? "bg-blue-500/10 border-blue-500/30 opacity-100" : "bg-blue-500/5 border-blue-500/10 opacity-30")}>
                <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-blue-500 text-black font-bold text-[10px] md:text-xs rounded-sm">11</div>
                <span className="text-xs md:text-sm font-medium whitespace-nowrap">11バック</span>
              </div>
              <div className={cn("flex items-center gap-3 p-1.5 md:p-2 border rounded transition-opacity shrink-0", isRevolution ? "bg-emerald-500/10 border-emerald-500/30 opacity-100" : "bg-emerald-500/5 border-emerald-500/10 opacity-30")}>
                <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-emerald-500 text-black font-bold text-[10px] md:text-xs rounded-sm">革</div>
                <span className="text-xs md:text-sm font-medium whitespace-nowrap">革命</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 mt-4 md:mt-8">
            <h3 className="text-[10px] sm:text-xs uppercase tracking-tighter text-slate-500 mb-2 md:mb-4 whitespace-nowrap">アクティブ能力</h3>
            <div className="flex flex-row md:flex-col gap-2">
              {gameState.abilities.filter(a => a.type === 'active').map(ability => (
                <button
                  key={ability.id}
                  onClick={() => handleActiveAbility(ability.id)}
                  disabled={ability.isUsed || turn !== 'player'}
                  className={cn(
                    "flex flex-col items-start gap-1 p-2 border rounded text-left transition-all",
                    ability.isUsed 
                      ? "bg-slate-900 border-slate-800 opacity-50"
                      : "bg-red-900/20 border-red-500/30 hover:bg-red-900/40 hover:border-red-500/60"
                  )}
                >
                  <span className={cn("text-xs font-bold", ability.isUsed ? "text-slate-500" : "text-red-400")}>
                    {ability.name}
                  </span>
                  <span className="text-[10px] text-slate-400 hidden md:block leading-tight">
                    {ability.description}
                  </span>
                </button>
              ))}
              {gameState.abilities.filter(a => a.type === 'active').length === 0 && (
                <span className="text-xs text-slate-600 italic">なし</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: The Table */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8 bg-[radial-gradient(circle_at_center,_#1a1a1c_0%,_#0a0a0b_100%)] min-h-[400px]">
          
          {/* Opponent 2 (Top) */}
          <div className="absolute top-4 md:top-8 flex flex-col items-center">
            <span className={cn("font-serif text-sm md:text-base transition-colors", turn.startsWith('enemy2') ? "text-amber-400" : "text-slate-400")}>敵2</span>
            <div className="flex justify-center flex-wrap pt-2 gap-[-20px] md:gap-[-30px]">
              <AnimatePresence>
                {hands.enemy2.map((card) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="inline-block -ml-6 md:-ml-8 first:ml-0 scale-[0.35] md:scale-50 origin-top"
                  >
                    <PlayingCard card={card} hidden={!gameState.abilities.some(a => a.id === 'clairvoyance')} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Opponent 1 (Left) */}
          <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <span className={cn("font-serif text-sm md:text-base transition-colors", turn.startsWith('enemy1') ? "text-amber-400" : "text-slate-400")}>敵1</span>
            <div className="flex flex-col justify-center flex-wrap pt-2 gap-[-30px]">
              <AnimatePresence>
                {hands.enemy1.map((card) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="inline-block -mt-16 md:-mt-24 first:mt-0 scale-[0.35] md:scale-50 origin-left rotate-90"
                  >
                    <PlayingCard card={card} hidden={!gameState.abilities.some(a => a.id === 'clairvoyance')} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Opponent 3 (Right) */}
          <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <span className={cn("font-serif text-sm md:text-base transition-colors", turn.startsWith('enemy3') ? "text-amber-400" : "text-slate-400")}>敵3</span>
            <div className="flex flex-col justify-center flex-wrap pt-2 gap-[-30px]">
              <AnimatePresence>
                {hands.enemy3.map((card) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="inline-block -mt-16 md:-mt-24 first:mt-0 scale-[0.35] md:scale-50 origin-right -rotate-90"
                  >
                    <PlayingCard card={card} hidden={!gameState.abilities.some(a => a.id === 'clairvoyance')} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Played Hand (Center) */}
          <div className="flex flex-col items-center justify-center w-full relative z-10">
             {trick.length === 0 && <div className="text-slate-500 tracking-[0.2em] text-[10px] md:text-xs">カードを出してください</div>}
             <div className="flex flex-wrap justify-center">
                <AnimatePresence>
                  {currentTopPlay && currentTopPlay.cards.map((card, index) => (
                    <motion.div
                      key={card.id}
                      initial={{ scale: 0.8, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      style={{
                        transform: \`translate(\${index * -15}px, 0) rotate(\${index * -5}deg)\`,
                        zIndex: index
                      }}
                      className="origin-bottom"
                    >
                      <PlayingCard card={card} isEnemy={false} disabled />
                    </motion.div>
                  ))}
                </AnimatePresence>
             </div>
             {currentTopPlay && (
                <div className="mt-6 md:mt-8 text-slate-500 tracking-[0.2em] text-[10px] md:text-xs bg-black/50 px-3 py-1 rounded-full border border-white/5">
                  現在の場: {getPlayTypeName(currentTopPlay.type)} {currentTopPlay.count > 1 ? \`x\${currentTopPlay.count}\` : ''}
                </div>
             )}
          </div>
        </div>

        {/* Right Sidebar: Logs */}
        <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-white/10 bg-black/20 p-4 md:p-6 hidden lg:flex flex-col shrink-0 z-20">
           <h3 className="text-xs uppercase tracking-tighter text-slate-500 mb-4">ターン</h3>
           <div className="text-xl font-bold text-amber-500 mb-6">
              {turn === 'trick_end' ? '処理中...' : turn.startsWith('player') ? 'あなたのターン' : turn.startsWith('enemy1') ? '敵1のターン' : turn.startsWith('enemy2') ? '敵2のターン' : '敵3のターン'}
           </div>
           
           <h3 className="text-xs uppercase tracking-tighter text-slate-500 mb-2">ログ</h3>
           <div className="flex-1 overflow-y-auto text-xs space-y-2 text-slate-400 pr-2 custom-scrollbar">
             {logs.map((log, i) => (
               <div key={i} className={log.includes('あなた') ? 'text-blue-300' : log.includes('敵') ? 'text-red-300' : 'text-amber-300'}>
                 {log}
               </div>
             ))}
           </div>

           {turn === 'player_pass_7' && (
             <div className="text-sm text-yellow-400 mt-4 bg-yellow-900/20 p-3 rounded-lg border border-yellow-500/20">
               渡すカードを {passCount7} 枚選んでください
             </div>
           )}
           {turn === 'player_discard_10' && (
             <div className="text-sm text-yellow-400 mt-4 bg-yellow-900/20 p-3 rounded-lg border border-yellow-500/20">
               捨てるカードを {discardCount10} 枚まで選んでください
             </div>
           )}
        </div>
      </div>

      {/* Player Hand Area */}
      <div className="h-[200px] md:h-64 border-t border-white/10 bg-black/80 px-2 md:px-8 py-4 md:py-6 flex flex-col items-center shrink-0 relative z-30">
         <div className="flex justify-center items-end h-full relative max-w-6xl w-full">
            <AnimatePresence>
              {hands.player.map((card) => (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="inline-block -ml-10 sm:-ml-12 md:-ml-14 first:ml-0 hover:z-20 relative transition-transform cursor-pointer"
                  style={{ zIndex: selectedIds.has(card.id) ? 30 : 10 }}
                >
                  <PlayingCard
                    card={card}
                    isSelected={selectedIds.has(card.id)}
                    onClick={() => toggleCardSelection(card.id)}
                    disabled={!turn.startsWith('player')}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
         </div>

         {/* Actions Bar Overlay */}
         <div className="absolute top-[-24px] md:top-[-32px] right-2 md:right-8 flex gap-2 md:gap-4 z-40">
           {turn === 'player' && (
             <>
               <button
                 onClick={() => {
                   if (trickOwner === 'player') {
                     setTrickOwner(null);
                     setTrick([]);
                   } else {
                     handlePass('player');
                   }
                 }}
                 disabled={trickOwner === 'player'}
                 className="px-6 md:px-8 py-2 md:py-3 bg-slate-800 border border-white/20 rounded-full font-bold tracking-widest text-xs md:text-sm hover:bg-slate-700 transition-colors shadow-lg disabled:opacity-50"
               >
                 パス
               </button>
               <button
                 onClick={attemptPlayerPlay}
                 disabled={!isValid || selectedIds.size === 0}
                 className="px-8 md:px-10 py-2 md:py-3 bg-amber-600 text-black border border-amber-400 rounded-full font-bold tracking-widest text-sm md:text-base hover:bg-amber-500 transition-colors shadow-xl shadow-amber-900/40 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500 disabled:shadow-none"
               >
                 出す
               </button>
             </>
           )}
           {turn === 'player_pass_7' && (
             <button
               onClick={attemptPlayerPass7}
               disabled={selectedIds.size !== passCount7}
               className="px-8 md:px-10 py-2 md:py-3 bg-blue-600 text-white border border-blue-400 rounded-full font-bold tracking-widest text-sm md:text-base hover:bg-blue-500 transition-colors shadow-xl shadow-blue-900/40 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500 disabled:shadow-none"
             >
               渡す
             </button>
           )}
           {turn === 'player_discard_10' && (
             <button
               onClick={attemptPlayerDiscard10}
               disabled={selectedIds.size === 0 || selectedIds.size > discardCount10}
               className="px-8 md:px-10 py-2 md:py-3 bg-red-600 text-white border border-red-400 rounded-full font-bold tracking-widest text-sm md:text-base hover:bg-red-500 transition-colors shadow-xl shadow-red-900/40 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500 disabled:shadow-none"
             >
               捨てる
             </button>
           )}
         </div>
      </div>
    </div>
  );
}
`

fs.writeFileSync('src/components/CombatView.tsx', code);
