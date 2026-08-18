import React, { useState, useEffect } from 'react';
import { CardData, GameState, Play, TurnState, Rank, Suit, Actor, RankTitle } from '../types';
import { createEnemyHands, createAllFourHands, applyTaxExchange, evaluatePlay, canPlay, getAIOptimalPlay, getCardStrength } from '../utils/daifugo';
import { playSound } from '../utils/sound';
import { PlayingCard } from './PlayingCard';
import { AbilityIcon } from '../data/abilityIcons';
import { Trophy, Coins, MessageSquare, LogOut, ArrowRight, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RoomInfo, ChatMessage } from '../types/multiplayer';
import { socketService } from '../services/socket';
import { MultiplayerChat } from './MultiplayerChat';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CombatViewProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  roomInfo?: RoomInfo | null;
  myActor?: string;
}

const ACTORS: Actor[] = ['player', 'enemy1', 'enemy2', 'enemy3'];

const EFFECT_STYLES: Record<string, { glow: string; border: string; text: string }> = {
  revolution: { glow: 'shadow-[0_0_100px_30px_rgba(225,29,72,0.55)]', border: 'border-rose-500', text: 'text-rose-400' },
  '11back': { glow: 'shadow-[0_0_100px_30px_rgba(56,189,248,0.55)]', border: 'border-sky-400', text: 'text-sky-300' },
  '8giri': { glow: 'shadow-[0_0_100px_30px_rgba(56,189,248,0.55)]', border: 'border-sky-400', text: 'text-sky-300' },
  '10discard': { glow: 'shadow-[0_0_100px_30px_rgba(244,63,94,0.55)]', border: 'border-rose-400', text: 'text-rose-300' },
  '7pass': { glow: 'shadow-[0_0_100px_30px_rgba(245,158,11,0.55)]', border: 'border-amber-400', text: 'text-amber-300' },
  joker: { glow: 'shadow-[0_0_100px_30px_rgba(168,85,247,0.6)]', border: 'border-purple-400', text: 'text-purple-300' },
  ability: { glow: 'shadow-[0_0_100px_30px_rgba(234,179,8,0.6)]', border: 'border-amber-300', text: 'text-amber-300' },
};

export function CombatView({ gameState, setGameState, roomInfo, myActor = 'player' }: CombatViewProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(roomInfo?.chatMessages || []);
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null);

  const currentMyActor = (ACTORS.includes(myActor as Actor) ? myActor : 'player') as Actor;
  const isHost = !roomInfo || Boolean(roomInfo.players.find(p => p.actor === currentMyActor)?.isHost);

  const isCpuActor = (actor: Actor): boolean => {
    if (!roomInfo) return actor !== 'player';
    const p = roomInfo.players.find(item => item.actor === actor);
    return !p || p.isCpu;
  };

  const getRotatedActors = (me: Actor) => {
    const idx = ACTORS.indexOf(me);
    return {
      bottom: ACTORS[idx],
      left: ACTORS[(idx + 1) % 4],
      top: ACTORS[(idx + 2) % 4],
      right: ACTORS[(idx + 3) % 4],
    };
  };

  const { bottom, left, top, right } = getRotatedActors(currentMyActor);

  useEffect(() => {
    if (roomInfo) {
      const unsubChat = socketService.onChatReceived((msg) => {
        setChatMessages(prev => [...prev, msg]);
      });
      return () => {
        unsubChat?.();
      };
    }
  }, [roomInfo]);

  const getActorName = (actor: Actor) => {
    if (roomInfo) {
      const p = roomInfo.players.find(item => item.actor === actor);
      if (p) {
        if (p.actor === currentMyActor) return `${p.name} (あなた)`;
        return p.name;
      }
    }
    switch (actor) {
      case 'player': return 'あなた';
      case 'enemy1': return 'CPU 1';
      case 'enemy2': return 'CPU 2';
      case 'enemy3': return 'CPU 3';
    }
  };

  const [hands, setHands] = useState<Record<Actor, CardData[]>>(() => {
    if (roomInfo) {
      if (roomInfo.gameState && roomInfo.gameState.hands) {
        return roomInfo.gameState.hands;
      }
      if ((gameState as any).hands) {
        return (gameState as any).hands;
      }
      if (isHost) {
        let initial = createAllFourHands();
        if (gameState.round > 1) {
          initial = applyTaxExchange(initial, gameState.ranks);
        }
        return initial;
      }
      return { player: [], enemy1: [], enemy2: [], enemy3: [] };
    }
    const enemyDecks = createEnemyHands(gameState.round, gameState.playerDeck);
    let initial = {
      player: [...gameState.playerDeck].sort((a,b) => a.rank - b.rank),
      enemy1: enemyDecks.enemy1,
      enemy2: enemyDecks.enemy2,
      enemy3: enemyDecks.enemy3,
    };
    if (gameState.round > 1) {
      initial = applyTaxExchange(initial, gameState.ranks);
    }
    return initial;
  });

  const [trick, setTrick] = useState<Play[]>([]);
  const [trickOwner, setTrickOwner] = useState<Actor | null>(null);
  const [passedActors, setPassedActors] = useState<Set<Actor>>(new Set());

  const [finishedActors, setFinishedActors] = useState<Actor[]>([]);
  const [miyakoOchiActor, setMiyakoOchiActor] = useState<Actor | null>(null);
  const [roundEnded, setRoundEnded] = useState(false);
  const [roundSummary, setRoundSummary] = useState<{
    rankings: { actor: Actor; rankTitle: RankTitle; pts: number; totalPts: number; gold: number; isMiyakoOchi?: boolean }[];
    winner: Actor;
    isGameCleared: boolean;
    isGameOver: boolean;
  } | null>(null);

  const [logs, setLogs] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg].slice(-8));
  };

  const [turn, setTurn] = useState<TurnState>('player');
  const [nextTurnAfterSpecial, setNextTurnAfterSpecial] = useState<TurnState | null>(null);
  const [passCount7, setPassCount7] = useState<number>(0);
  const [discardCount10, setDiscardCount10] = useState<number>(0);
  const [rensaPendingActor, setRensaPendingActor] = useState<Actor | null>(null);

  const [isRevolution, setIsRevolution] = useState(false);
  const [is11Back, setIs11Back] = useState(false);

  // Effective Reversed calculation (Revolution XOR 11-Back)
  const effectiveReversed = (isRevolution && !is11Back) || (!isRevolution && is11Back);

  const [screenEffect, setScreenEffect] = useState<{
    id: string;
    type: 'revolution' | '11back' | '8giri' | '10discard' | '7pass' | 'joker' | 'ability';
    title: string;
    subtitle: string;
    actorName: string;
  } | null>(null);

  // Auto-clear screenEffect after 1.5s
  useEffect(() => {
    if (!screenEffect) return;
    const timer = setTimeout(() => {
      setScreenEffect(null);
      if (roomInfo) {
        broadcastState({ screenEffect: null });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [screenEffect?.id]);

  // Sync state helper
  const broadcastState = (overrides: Partial<{
    hands: Record<Actor, CardData[]>;
    turn: TurnState;
    trick: Play[];
    trickOwner: Actor | null;
    passedActors: Set<Actor> | Actor[];
    finishedActors: Actor[];
    miyakoOchiActor: Actor | null;
    isRevolution: boolean;
    is11Back: boolean;
    logs: string[];
    screenEffect: any;
    passCount7: number;
    discardCount10: number;
    nextTurnAfterSpecial: TurnState | null;
    roundEnded: boolean;
    roundSummary: any;
    rensaPendingActor: Actor | null;
  }> = {}) => {
    if (!roomInfo) return;

    const payload: any = {
      phase: 'combat',
      hands: overrides.hands !== undefined ? overrides.hands : hands,
      turn: overrides.turn !== undefined ? overrides.turn : turn,
      trick: overrides.trick !== undefined ? overrides.trick : trick,
      trickOwner: overrides.trickOwner !== undefined ? overrides.trickOwner : trickOwner,
      passedActors: overrides.passedActors ? Array.from(overrides.passedActors) : Array.from(passedActors),
      finishedActors: overrides.finishedActors !== undefined ? overrides.finishedActors : finishedActors,
      miyakoOchiActor: overrides.miyakoOchiActor !== undefined ? overrides.miyakoOchiActor : miyakoOchiActor,
      isRevolution: overrides.isRevolution !== undefined ? overrides.isRevolution : isRevolution,
      is11Back: overrides.is11Back !== undefined ? overrides.is11Back : is11Back,
      logs: overrides.logs !== undefined ? overrides.logs : logs,
      passCount7: overrides.passCount7 !== undefined ? overrides.passCount7 : passCount7,
      discardCount10: overrides.discardCount10 !== undefined ? overrides.discardCount10 : discardCount10,
      nextTurnAfterSpecial: overrides.nextTurnAfterSpecial !== undefined ? overrides.nextTurnAfterSpecial : nextTurnAfterSpecial,
      roundEnded: overrides.roundEnded !== undefined ? overrides.roundEnded : roundEnded,
      roundSummary: overrides.roundSummary !== undefined ? overrides.roundSummary : roundSummary,
      screenEffect: overrides.screenEffect !== undefined ? overrides.screenEffect : null,
      rensaPendingActor: overrides.rensaPendingActor !== undefined ? overrides.rensaPendingActor : rensaPendingActor,
    };

    socketService.syncGameState(payload);
  };

  // Initial broadcast on mount for Host
  useEffect(() => {
    if (roomInfo) {
      if (isHost) {
        let currentHands = hands;
        const hasEmptyHand = ACTORS.some(a => !currentHands[a] || currentHands[a].length === 0);
        if (hasEmptyHand) {
          currentHands = createAllFourHands();
          if (gameState.round > 1) {
            currentHands = applyTaxExchange(currentHands, gameState.ranks);
          }
          setHands(currentHands);
        }

        broadcastState({
          hands: currentHands,
          turn: 'player',
          trick: [],
          trickOwner: null,
          passedActors: [],
          finishedActors: [],
          miyakoOchiActor: null,
          isRevolution: false,
          is11Back: false,
          logs: [`第 ${gameState.round} ラウンド開始！手札が配布されました。`]
        });
      } else {
        if (roomInfo.gameState && roomInfo.gameState.hands) {
          setHands(roomInfo.gameState.hands);
        }
      }
    }
  }, []);

  // Socket listener for state sync
  useEffect(() => {
    if (!roomInfo) return;

    const unsubPlayerLeft = socketService.onPlayerLeftGame(({ message }) => {
      setLeaveNotice(message);
      addLog(`【離脱通知】${message}`);
      setTimeout(() => setLeaveNotice(null), 6000);
    });

    const unsubStateSynced = socketService.onGameStateSynced((synced) => {
      if (!synced) return;
      if (synced.hands) setHands(synced.hands);
      if (synced.turn !== undefined) setTurn(synced.turn);
      if (synced.trick !== undefined) setTrick(synced.trick);
      if (synced.trickOwner !== undefined) setTrickOwner(synced.trickOwner);
      if (synced.passedActors) setPassedActors(new Set(synced.passedActors));
      if (synced.finishedActors) setFinishedActors(synced.finishedActors);
      if (synced.miyakoOchiActor !== undefined) setMiyakoOchiActor(synced.miyakoOchiActor);
      if (synced.isRevolution !== undefined) setIsRevolution(synced.isRevolution);
      if (synced.is11Back !== undefined) setIs11Back(synced.is11Back);
      if (synced.logs) setLogs(synced.logs);
      if (synced.passCount7 !== undefined) setPassCount7(synced.passCount7);
      if (synced.discardCount10 !== undefined) setDiscardCount10(synced.discardCount10);
      if (synced.nextTurnAfterSpecial !== undefined) setNextTurnAfterSpecial(synced.nextTurnAfterSpecial);
      if (synced.roundEnded !== undefined) setRoundEnded(synced.roundEnded);
      if (synced.roundSummary !== undefined) setRoundSummary(synced.roundSummary);
      if (synced.screenEffect !== undefined) setScreenEffect(synced.screenEffect);
      if (synced.rensaPendingActor !== undefined) setRensaPendingActor(synced.rensaPendingActor);
    });

    return () => {
      unsubPlayerLeft?.();
      unsubStateSynced?.();
    };
  }, [roomInfo]);

  // Current top play on current trick
  const currentTopPlay: Play | null = trick.length > 0 ? trick[trick.length - 1] : null;

  const getPlayTypeName = (play: Play): string => {
    const cardDesc = play.cards.map(c => `${c.suit}${getDisplayRank(c.rank)}`).join(' ');
    if (play.type === 'Single') return `${cardDesc}`;
    if (play.type === 'Group') return `${play.count}枚組み (${cardDesc})`;
    if (play.type === 'Sequence') return `${play.count}枚階段 (${cardDesc})`;
    return cardDesc;
  };

  const getDisplayRank = (rank: Rank): string => {
    switch (rank) {
      case 11: return 'J';
      case 12: return 'Q';
      case 13: return 'K';
      case 14: return 'A';
      case 15: return '2';
      case 16: return 'Joker';
      default: return rank.toString();
    }
  };

  const getNextActor = (current: Actor): Actor => {
    const idx = ACTORS.indexOf(current);
    return ACTORS[(idx + 1) % 4];
  };

  const getNextActiveActor = (current: Actor): Actor => {
    let next = getNextActor(current);
    let count = 0;
    while (((hands[next]?.length || 0) === 0 || finishedActors.includes(next)) && count < 4) {
      next = getNextActor(next);
      count++;
    }
    return next;
  };

  // Check finished actors & Miyako-ochi
  useEffect(() => {
    if (roundEnded) return;

    const totalCardsInGame = Object.values(hands).reduce((sum: number, h) => sum + ((h as CardData[])?.length || 0), 0);
    if (totalCardsInGame === 0) return;

    ACTORS.forEach(actor => {
      if (hands[actor] && hands[actor].length === 0 && !finishedActors.includes(actor)) {
        // Detect 1st place
        if (finishedActors.length === 0) {
          const lastWinner = gameState.lastWinner;
          if (lastWinner && lastWinner !== actor && hands[lastWinner] && hands[lastWinner].length > 0) {
            const isGuard = (gameState.abilities[lastWinner] || []).some(a => a.id === 'defense_up');
            if (isGuard) {
              addLog(`【都落ちガード発動！】都落ちを回避した！`);
            } else {
              addLog(`【都落ち発動！】前回の1位 ${getActorName(lastWinner)} は最下位（大貧民）に確定！`);
              setMiyakoOchiActor(lastWinner);
              setHands(prev => ({ ...prev, [lastWinner]: [] }));
            }
          }
        }

        addLog(`${getActorName(actor)} が上がりました！ (${finishedActors.length + 1}位)`);
        setFinishedActors(prev => [...prev, actor]);
      }
    });
  }, [hands, finishedActors, gameState.lastWinner, gameState.abilities, roundEnded]);

  // Round completion check
  useEffect(() => {
    if (roundEnded) return;

    const totalCardsInGame = Object.values(hands).reduce((sum: number, h) => sum + ((h as CardData[])?.length || 0), 0);
    if (totalCardsInGame === 0) return;

    let effectiveFinished = [...finishedActors];
    const remainingActors = ACTORS.filter(a => !effectiveFinished.includes(a) && a !== miyakoOchiActor && (hands[a]?.length || 0) > 0);

    if (effectiveFinished.length >= 3 || remainingActors.length === 0) {
      let finalOrder: Actor[] = [...effectiveFinished];

      remainingActors.forEach(a => {
        if (!finalOrder.includes(a)) finalOrder.push(a);
      });

      if (miyakoOchiActor) {
        finalOrder = finalOrder.filter(a => a !== miyakoOchiActor);
        finalOrder.push(miyakoOchiActor);
      }

      ACTORS.forEach(a => {
        if (!finalOrder.includes(a)) finalOrder.push(a);
      });

      const titles: RankTitle[] = ['大富豪', '富豪', '貧民', '大貧民'];
      const points = [3, 2, 1, 0];
      const baseGold = [60, 40, 20, 10];

      const rankings = finalOrder.map((actor, idx) => {
        const title = titles[idx];
        let pts = points[idx];
        const hasGoldRush = (gameState.abilities[actor] || []).some(a => a.id === 'gold_rush');
        const hasFukutsu = (gameState.abilities[actor] || []).some(a => a.id === 'fukutsu');
        const gold = baseGold[idx] + (hasGoldRush ? 50 : 0) + (actor === miyakoOchiActor && hasFukutsu ? 30 : 0);
        const totalPts = (gameState.scores[actor] || 0) + pts;
        return {
          actor,
          rankTitle: title,
          pts,
          totalPts,
          gold,
          isMiyakoOchi: actor === miyakoOchiActor
        };
      });

      // Each client judges the outcome from its own seat: I clear the game if I'm
      // the (co-)leader once someone crosses 12pt, otherwise it's game over for me.
      const myRankObj = rankings.find(r => r.actor === currentMyActor);
      const myTotalPts = myRankObj ? myRankObj.totalPts : 0;
      const anyoneElse12 = rankings.some(r => r.actor !== currentMyActor && r.totalPts >= 12);

      const isGameCleared = myTotalPts >= 12 && !rankings.some(r => r.actor !== currentMyActor && r.totalPts > myTotalPts);
      const isGameOver = !isGameCleared && anyoneElse12;

      setRoundSummary({
        rankings,
        winner: finalOrder[0],
        isGameCleared,
        isGameOver
      });
      setRoundEnded(true);
    }
  }, [finishedActors, miyakoOchiActor, hands, gameState.scores, gameState.abilities, roundEnded]);

  // Turn advancement / Skip finished actors / Trick clear
  useEffect(() => {
    if (roundEnded) return;

    if (ACTORS.includes(turn as Actor)) {
      const currentActor = turn as Actor;

      // 1. Skip finished or empty-hand actors
      if ((hands[currentActor]?.length || 0) === 0 || finishedActors.includes(currentActor)) {
        const nextActor = getNextActiveActor(currentActor);
        if (nextActor !== currentActor) {
          setTurn(nextActor);
        }
        return;
      }

      // 2. Trick clearing check (When everyone passed)
      if (trick.length > 0) {
        const activeActors = ACTORS.filter(a => (hands[a]?.length || 0) > 0 && !finishedActors.includes(a));
        const isTrickOwnerActive = trickOwner && activeActors.includes(trickOwner);
        const requiredPasses = isTrickOwnerActive ? Math.max(1, activeActors.length - 1) : activeActors.length;

        if (passedActors.size >= requiredPasses && passedActors.size > 0) {
          if (isHost || currentActor === currentMyActor) {
            setTurn('trick_end');
            broadcastState({ turn: 'trick_end' });
            setTimeout(() => {
              setTrick([]);
              setIs11Back(false);
              setPassedActors(new Set());
              let newOwner = trickOwner;
              if (!newOwner || (hands[newOwner]?.length || 0) === 0 || finishedActors.includes(newOwner)) {
                newOwner = currentActor;
              }
              setTrickOwner(newOwner);
              setTurn(newOwner);
              broadcastState({
                trick: [],
                is11Back: false,
                passedActors: [],
                trickOwner: newOwner,
                turn: newOwner
              });
            }, 1000);
          }
          return;
        }
      }
    }
  }, [turn, hands, finishedActors, roundEnded, trick, trickOwner, passedActors, isHost, currentMyActor]);

  // AI Turn Logic for CPU
  useEffect(() => {
    if (roundEnded) return;

    const currentActor = (turn.includes('_') ? turn.split('_')[0] : turn) as Actor;

    if (isCpuActor(currentActor) && isHost) {
      if (ACTORS.includes(currentActor) && (hands[currentActor]?.length || 0) > 0 && !turn.includes('_')) {
        const timer = setTimeout(() => {
          const effectiveTopPlay = (trickOwner === currentActor || trick.length === 0 || !trickOwner) ? null : currentTopPlay;
          const cpuHasThreeCardRevolution = (gameState.abilities[currentActor] || []).some(a => a.id === 'three_card_revolution');
          const aiPlay = getAIOptimalPlay(hands[currentActor] || [], effectiveReversed, effectiveTopPlay, cpuHasThreeCardRevolution);
          if (aiPlay) {
            executePlay(aiPlay, currentActor);
          } else {
            handlePass(currentActor);
          }
        }, 800);
        return () => clearTimeout(timer);
      }

      // CPU Special Turn: 7 Pass
      if (turn.endsWith('_pass_7')) {
        const hand = hands[currentActor] || [];
        if (hand.length === 0) {
          const nxt = nextTurnAfterSpecial || getNextActiveActor(currentActor);
          setTurn(nxt);
          setNextTurnAfterSpecial(null);
          setPassCount7(0);
          broadcastState({ turn: nxt, passCount7: 0, nextTurnAfterSpecial: null });
          return;
        }
        const timer = setTimeout(() => {
          const countToPass = Math.min(Math.max(1, passCount7), hand.length);
          const sorted = [...hand].sort((a,b) => {
            const sA = getCardStrength(a.rank, effectiveReversed);
            const sB = getCardStrength(b.rank, effectiveReversed);
            return sA - sB; // Pass weakest cards
          });
          const cardsToPass = sorted.slice(0, countToPass);
          const passIds = new Set(cardsToPass.map(c => c.id));
          const recipient = getNextActiveActor(currentActor);

          const updatedHands = {
            ...hands,
            [currentActor]: hand.filter(c => !passIds.has(c.id)),
            [recipient]: [...(hands[recipient] || []), ...cardsToPass].sort((a,b) => a.rank - b.rank)
          };

          const nxt = nextTurnAfterSpecial || recipient;
          setHands(updatedHands);
          setTurn(nxt);
          setNextTurnAfterSpecial(null);
          setPassCount7(0);
          broadcastState({ hands: updatedHands, turn: nxt, passCount7: 0, nextTurnAfterSpecial: null });
        }, 800);
        return () => clearTimeout(timer);
      }

      // CPU Special Turn: 10 Discard
      if (turn.endsWith('_discard_10')) {
        const hand = hands[currentActor] || [];
        if (hand.length === 0) {
          const nxt = nextTurnAfterSpecial || getNextActiveActor(currentActor);
          setTurn(nxt);
          setNextTurnAfterSpecial(null);
          setDiscardCount10(0);
          broadcastState({ turn: nxt, discardCount10: 0, nextTurnAfterSpecial: null });
          return;
        }
        const timer = setTimeout(() => {
          const countToDiscard = Math.min(Math.max(1, discardCount10), hand.length);
          const sorted = [...hand].sort((a,b) => {
            const sA = getCardStrength(a.rank, effectiveReversed);
            const sB = getCardStrength(b.rank, effectiveReversed);
            return sA - sB; // Discard weakest cards
          });
          const cardsToDiscard = sorted.slice(0, countToDiscard);
          const discardIds = new Set(cardsToDiscard.map(c => c.id));

          const updatedHands = {
            ...hands,
            [currentActor]: hand.filter(c => !discardIds.has(c.id))
          };

          const nxt = nextTurnAfterSpecial || getNextActiveActor(currentActor);
          setHands(updatedHands);
          setTurn(nxt);
          setNextTurnAfterSpecial(null);
          setDiscardCount10(0);
          broadcastState({ hands: updatedHands, turn: nxt, discardCount10: 0, nextTurnAfterSpecial: null });
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [turn, hands, effectiveReversed, currentTopPlay, passCount7, discardCount10, nextTurnAfterSpecial, trickOwner, finishedActors, roundEnded, isHost, roomInfo, gameState.abilities]);

  // Reset card selections when turn changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [turn]);

  // Execute Play
  const executePlay = (play: Play, actor: Actor) => {
    playSound.play();
    const playIds = new Set(play.cards.map(c => c.id));
    const currentHand = hands[actor] || [];
    const remainingHand = currentHand.filter(c => !playIds.has(c.id));

    const updatedHands = {
      ...hands,
      [actor]: remainingHand
    };
    setHands(updatedHands);

    if (actor === currentMyActor) {
      setSelectedIds(new Set());
    }

    const updatedTrick = [...trick, play];
    setTrick(updatedTrick);
    setTrickOwner(actor);

    // Reset passes when a valid play is made
    const newPassedActors = new Set<Actor>();
    setPassedActors(newPassedActors);

    const playName = getPlayTypeName(play);
    addLog(`${getActorName(actor)} が ${playName} を出しました。`);

    let newScreenEffect: any = null;
    if (play.isRevolution) {
      newScreenEffect = {
        id: `rev_${Date.now()}`,
        type: 'revolution' as const,
        title: '⚡ 革命 REVOLUTION ⚡',
        subtitle: '強さの順位が反転！下剋上開幕！',
        actorName: getActorName(actor)
      };
    } else if (play.has11) {
      newScreenEffect = {
        id: `11b_${Date.now()}`,
        type: '11back' as const,
        title: '🌀 11バック 11-BACK 🌀',
        subtitle: '時空歪曲！場が流れるまでカード強度が反転！',
        actorName: getActorName(actor)
      };
    } else if (play.has8) {
      newScreenEffect = {
        id: `8g_${Date.now()}`,
        type: '8giri' as const,
        title: '⚔️ 8切り 8-SLASH ⚔️',
        subtitle: '一閃！場を強烈に一掃！',
        actorName: getActorName(actor)
      };
    } else if (play.cards.some(c => c.rank === 16)) {
      newScreenEffect = {
        id: `jok_${Date.now()}`,
        type: 'joker' as const,
        title: '🃏 ジョーカー降臨 JOKER 🃏',
        subtitle: '最強カードが場を圧迫！',
        actorName: getActorName(actor)
      };
    } else if (play.has10) {
      newScreenEffect = {
        id: `10d_${Date.now()}`,
        type: '10discard' as const,
        title: '🃏 10捨て DISCARD 🃏',
        subtitle: '手札から不必要なカードを消去！',
        actorName: getActorName(actor)
      };
    } else if (play.has7) {
      newScreenEffect = {
        id: `7p_${Date.now()}`,
        type: '7pass' as const,
        title: '🎁 7渡し PASS 🎁',
        subtitle: '隣のプレイヤーへカードを押し付け！',
        actorName: getActorName(actor)
      };
    }

    if (newScreenEffect) {
      setScreenEffect(newScreenEffect);
      playSound.special();
    }

    let isTrickCleared = false;
    let baseNextTurn: TurnState = getNextActiveActor(actor);

    let consumedRensa = false;
    if (rensaPendingActor === actor) {
      baseNextTurn = actor;
      consumedRensa = true;
    }

    let newIsRev = isRevolution;
    let newIs11 = is11Back;
    if (play.isRevolution) {
      newIsRev = !isRevolution;
      setIsRevolution(newIsRev);
    }
    if (play.has11) {
      newIs11 = true;
      setIs11Back(true);
    }

    // Check 8-Giri or Spade 3 against Joker
    const isSpade3VsJoker = currentTopPlay &&
      currentTopPlay.type === 'Single' &&
      currentTopPlay.cards.some(c => c.rank === 16) &&
      play.type === 'Single' &&
      play.cards.some(c => c.suit === '♠' && c.rank === 3);

    if (play.has8 || isSpade3VsJoker) {
      if (play.has8) addLog(`⚔️ 8切り発動！場が流れます。`);
      if (isSpade3VsJoker) addLog(`♠️3 スリースペード返し！ジョーカーを撃破して場が流れます。`);

      isTrickCleared = true;
      if (remainingHand.length === 0) {
        baseNextTurn = getNextActiveActor(actor);
      } else {
        baseNextTurn = actor; // 8-Giri owner plays again
      }
    }

    let specialTurn: TurnState | null = null;
    let newPass7Count = 0;
    let newDiscard10Count = 0;

    if (remainingHand.length > 0) {
      if (play.has10) {
        addLog(`10捨て発動！`);
        specialTurn = `${actor}_discard_10` as TurnState;
        const hasExtraDiscard = (gameState.abilities[actor] || []).some(a => a.id === 'extra_discard');
        newDiscard10Count = play.count10 + (hasExtraDiscard ? 1 : 0);
        setDiscardCount10(newDiscard10Count);
      } else if (play.has7) {
        addLog(`7渡し発動！`);
        specialTurn = `${actor}_pass_7` as TurnState;
        const hasTeppeki = (gameState.abilities[actor] || []).some(a => a.id === 'teppeki');
        newPass7Count = Math.max(1, play.count7 - (hasTeppeki ? 1 : 0));
        setPassCount7(newPass7Count);
      }
      if (specialTurn) {
        setNextTurnAfterSpecial(baseNextTurn);
      }
    }

    if (consumedRensa) {
      setRensaPendingActor(null);
    }

    if (isTrickCleared) {
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        const newTrickOwner = remainingHand.length === 0 ? getNextActiveActor(actor) : actor;
        setTrickOwner(newTrickOwner);
        const finalTurn = specialTurn || newTrickOwner;
        setTurn(finalTurn);
        broadcastState({
          hands: updatedHands,
          turn: finalTurn,
          trick: [],
          trickOwner: newTrickOwner,
          passedActors: [],
          is11Back: false,
          isRevolution: newIsRev,
          rensaPendingActor: consumedRensa ? null : rensaPendingActor
        });
      }, 1000);
    } else {
      const nextTurnVal = specialTurn || baseNextTurn;
      setTurn(nextTurnVal);
      broadcastState({
        hands: updatedHands,
        turn: nextTurnVal,
        trick: updatedTrick,
        trickOwner: actor,
        passedActors: Array.from(newPassedActors),
        rensaPendingActor: consumedRensa ? null : rensaPendingActor,
        isRevolution: newIsRev,
        is11Back: newIs11,
        passCount7: newPass7Count > 0 ? newPass7Count : passCount7,
        discardCount10: newDiscard10Count > 0 ? newDiscard10Count : discardCount10,
        nextTurnAfterSpecial: specialTurn ? baseNextTurn : nextTurnAfterSpecial,
      });
    }
  };

  const handlePass = (actor: Actor) => {
    playSound.pass();
    addLog(`${getActorName(actor)} がパスしました。`);

    const newPassedActors = new Set<Actor>(passedActors);
    newPassedActors.add(actor);
    setPassedActors(newPassedActors);

    if (actor === currentMyActor) {
      setSelectedIds(new Set());
    }

    const activeCount = ACTORS.filter(a => (hands[a]?.length || 0) > 0 && !finishedActors.includes(a)).length;
    if (newPassedActors.size >= (activeCount - 1) && trickOwner !== null) {
      addLog(`全員パス。場が流れました。`);
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());

        let newOwner = trickOwner;
        if (!newOwner || (hands[newOwner]?.length || 0) === 0 || finishedActors.includes(newOwner)) {
          newOwner = getNextActiveActor(trickOwner || actor);
        }
        setTrickOwner(newOwner);
        setTurn(newOwner);
        broadcastState({
          hands,
          turn: newOwner,
          trick: [],
          trickOwner: newOwner,
          passedActors: [],
          is11Back: false
        });
      }, 1000);

      broadcastState({
        hands,
        turn: 'trick_end',
        trick,
        trickOwner,
        passedActors: Array.from(newPassedActors)
      });
      return;
    }

    const next = getNextActiveActor(actor);
    setTurn(next);
    broadcastState({
      hands,
      turn: next,
      trick,
      trickOwner,
      passedActors: Array.from(newPassedActors)
    });
  };

  const toggleCardSelection = (id: string) => {
    if (turn !== currentMyActor && turn !== `${currentMyActor}_pass_7` && turn !== `${currentMyActor}_discard_10` && turn !== `${currentMyActor}_mulligan`) return;

    playSound[selectedIds.has(id) ? 'deselect' : 'select']();

    const myHandLen = hands[currentMyActor]?.length || 1;

    if (turn === `${currentMyActor}_mulligan`) {
      const maxDiscard = Math.min(3, myHandLen);
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        if (newSelected.size >= maxDiscard) {
          const first = Array.from(newSelected)[0];
          newSelected.delete(first);
        }
        newSelected.add(id);
      }
      setSelectedIds(newSelected);
      return;
    }

    if (turn === `${currentMyActor}_pass_7`) {
      const requiredPass = Math.min(Math.max(1, passCount7), myHandLen);
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        if (requiredPass === 1) {
          newSelected.clear();
          newSelected.add(id);
        } else {
          if (newSelected.size >= requiredPass) {
            const first = Array.from(newSelected)[0];
            newSelected.delete(first);
          }
          newSelected.add(id);
        }
      }
      setSelectedIds(newSelected);
      return;
    }

    if (turn === `${currentMyActor}_discard_10`) {
      const maxDiscard = Math.min(Math.max(1, discardCount10), myHandLen);
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        if (maxDiscard === 1) {
          newSelected.clear();
          newSelected.add(id);
        } else {
          if (newSelected.size >= maxDiscard) {
            const first = Array.from(newSelected)[0];
            newSelected.delete(first);
          }
          newSelected.add(id);
        }
      }
      setSelectedIds(newSelected);
      return;
    }

    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const attemptPlayerPlay = () => {
    const playerHand = hands[currentMyActor] || [];
    const selectedCards = playerHand.filter(c => selectedIds.has(c.id));
    const hasThreeCardRevolution = (gameState.abilities[currentMyActor] || []).some(a => a.id === 'three_card_revolution');
    const play = evaluatePlay(selectedCards, effectiveReversed, hasThreeCardRevolution);

    const effectiveTopPlay = (trickOwner === currentMyActor || trick.length === 0 || !trickOwner) ? null : currentTopPlay;
    if (play && canPlay(play, effectiveTopPlay, effectiveReversed)) {
      executePlay(play, currentMyActor);
    }
  };

  const attemptPlayerPass7 = () => {
    const playerHand = hands[currentMyActor] || [];
    const effectivePassCount = Math.max(1, passCount7);
    const requiredPass = Math.min(effectivePassCount, playerHand.length);

    if (requiredPass === 0) {
      const nxt = nextTurnAfterSpecial || getNextActiveActor(currentMyActor);
      setTurn(nxt);
      setNextTurnAfterSpecial(null);
      setPassCount7(0);
      broadcastState({ turn: nxt, passCount7: 0, nextTurnAfterSpecial: null });
      return;
    }

    if (selectedIds.size === requiredPass) {
      const selectedCards = playerHand.filter(c => selectedIds.has(c.id));
      const recipient = getNextActiveActor(currentMyActor);
      const recipientHand = hands[recipient] || [];
      const updated = {
        ...hands,
        [currentMyActor]: playerHand.filter(c => !selectedIds.has(c.id)),
        [recipient]: [...recipientHand, ...selectedCards].sort((a,b) => a.rank - b.rank)
      };
      setHands(updated);
      setSelectedIds(new Set());
      const nxt = nextTurnAfterSpecial || recipient;
      setTurn(nxt);
      setNextTurnAfterSpecial(null);
      setPassCount7(0);
      broadcastState({ hands: updated, turn: nxt, passCount7: 0, nextTurnAfterSpecial: null });
    }
  };

  const attemptPlayerDiscard10 = () => {
    const playerHand = hands[currentMyActor] || [];
    const effectiveDiscardCount = Math.max(1, discardCount10);
    const maxDiscard = Math.min(effectiveDiscardCount, playerHand.length);

    if (maxDiscard === 0) {
      const nxt = nextTurnAfterSpecial || getNextActiveActor(currentMyActor);
      setTurn(nxt);
      setNextTurnAfterSpecial(null);
      setDiscardCount10(0);
      broadcastState({ turn: nxt, discardCount10: 0, nextTurnAfterSpecial: null });
      return;
    }

    if (selectedIds.size > 0 && selectedIds.size <= maxDiscard) {
      const updated = {
        ...hands,
        [currentMyActor]: playerHand.filter(c => !selectedIds.has(c.id))
      };
      setHands(updated);
      setSelectedIds(new Set());
      const nxt = nextTurnAfterSpecial || getNextActiveActor(currentMyActor);
      setTurn(nxt);
      setNextTurnAfterSpecial(null);
      setDiscardCount10(0);
      broadcastState({ hands: updated, turn: nxt, discardCount10: 0, nextTurnAfterSpecial: null });
    }
  };

  const attemptPlayerMulligan = () => {
    const playerHand = hands[currentMyActor] || [];
    const requiredCount = Math.min(3, playerHand.length);
    if (selectedIds.size !== requiredCount) return;

    const suits: Suit[] = ['♠', '♥', '♦', '♣'];
    const newCards: CardData[] = Array.from({ length: requiredCount }).map((_, i) => ({
      id: `mulligan_${Date.now()}_${i}`,
      suit: suits[Math.floor(Math.random() * suits.length)],
      rank: Math.floor(Math.random() * 13) + 3 as Rank
    }));

    const updated = {
      ...hands,
      [currentMyActor]: [...playerHand.filter(c => !selectedIds.has(c.id)), ...newCards].sort((a, b) => a.rank - b.rank)
    };
    setHands(updated);
    setSelectedIds(new Set());
    addLog(`【手札厳選】${requiredCount}枚を入れ替えた！`);
    const nxt = nextTurnAfterSpecial || currentMyActor;
    setTurn(nxt);
    setNextTurnAfterSpecial(null);
    broadcastState({ hands: updated, turn: nxt, nextTurnAfterSpecial: null });
  };

  const PASSIVE_IDS = new Set(['clairvoyance', 'three_card_revolution', 'extra_discard', 'max_hp_up', 'gold_rush', 'defense_up', 'gyakuten_emperor', 'teppeki', 'kane_no_saihai', 'fukutsu']);
  const myAbilities = gameState.abilities[currentMyActor] || [];
  const activeAbilities = myAbilities.filter(a => a.type !== 'passive' && !PASSIVE_IDS.has(a.id));
  const passiveAbilities = myAbilities.filter(a => a.type === 'passive' || PASSIVE_IDS.has(a.id));

  const handleActiveAbility = (abilityId: string) => {
    if (turn !== currentMyActor) return;
    const targetAbility = myAbilities.find(a => a.id === abilityId);
    if (!targetAbility || targetAbility.type === 'passive' || PASSIVE_IDS.has(abilityId) || targetAbility.isUsed) return;

    playSound.ability();
    const updatedMine = myAbilities.map(a => a.id === abilityId ? { ...a, isUsed: true } : a);
    setGameState(prev => ({
      ...prev,
      abilities: { ...prev.abilities, [currentMyActor]: updatedMine }
    }));
    if (roomInfo) {
      socketService.syncGameState({ abilities: { [currentMyActor]: updatedMine } });
    }

    const abilEffect = {
      id: `abil_${Date.now()}`,
      type: 'ability' as const,
      title: `✨ 特殊能力【${targetAbility.name}】発動 ✨`,
      subtitle: targetAbility.description || 'アビリティの効果を適用！',
      actorName: getActorName(currentMyActor)
    };
    setScreenEffect(abilEffect);
    broadcastState({ screenEffect: abilEffect });

    if (abilityId === 'skip_turn') {
      addLog(`【威圧】敵のターンを強制パス！`);
      handlePass(getNextActiveActor(currentMyActor));
    } else if (abilityId === 'draw_cards' || abilityId === 'heal') {
      addLog(`【カード補充】山札からカードを2枚追加！`);
      const newCards: CardData[] = [
        { id: `draw_1_${Date.now()}`, suit: '♠', rank: Math.floor(Math.random() * 13) + 3 as Rank },
        { id: `draw_2_${Date.now()}`, suit: '♥', rank: Math.floor(Math.random() * 13) + 3 as Rank }
      ];
      setHands(prev => {
        const u = {
          ...prev,
          [currentMyActor]: [...(prev[currentMyActor] || []), ...newCards].sort((a,b) => a.rank - b.rank)
        };
        broadcastState({ hands: u });
        return u;
      });
    } else if (abilityId === 'strong_draw') {
      addLog(`【豪運】強カードを2枚引いた！`);
      const newCards: CardData[] = [
        { id: `sdraw_1_${Date.now()}`, suit: '♦', rank: Math.floor(Math.random() * 6) + 10 as Rank },
        { id: `sdraw_2_${Date.now()}`, suit: '♣', rank: Math.floor(Math.random() * 6) + 10 as Rank }
      ];
      setHands(prev => {
        const u = {
          ...prev,
          [currentMyActor]: [...(prev[currentMyActor] || []), ...newCards].sort((a,b) => a.rank - b.rank)
        };
        broadcastState({ hands: u });
        return u;
      });
    } else if (abilityId === 'joker_draw') {
      addLog(`【ジョーカー召喚】最強のカードを手に入れた！`);
      const newCards: CardData[] = [{ id: `joker_${Date.now()}`, suit: '★', rank: 16 as Rank }];
      setHands(prev => {
        const u = {
          ...prev,
          [currentMyActor]: [...(prev[currentMyActor] || []), ...newCards].sort((a,b) => a.rank - b.rank)
        };
        broadcastState({ hands: u });
        return u;
      });
    } else if (abilityId === 'reversal_joker_burst') {
      addLog(`【ジョーカー連打】最強ジョーカー3枚を降臨させた！`);
      const newJokers: CardData[] = [
        { id: `joker_b1_${Date.now()}`, suit: '★', rank: 16 as Rank },
        { id: `joker_b2_${Date.now()}`, suit: '★', rank: 16 as Rank },
        { id: `joker_b3_${Date.now()}`, suit: '★', rank: 16 as Rank }
      ];
      setHands(prev => {
        const u = {
          ...prev,
          [currentMyActor]: [...(prev[currentMyActor] || []), ...newJokers].sort((a,b) => a.rank - b.rank)
        };
        broadcastState({ hands: u });
        return u;
      });
    } else if (abilityId === 'gekurou_reversal') {
      addLog(`【一括強奪流し】場を即座に流し、敵の手札からカードを強奪！`);
      const stolenCards: CardData[] = [];
      const updatedHands = { ...hands };

      ACTORS.forEach(actor => {
        if (actor !== currentMyActor && (updatedHands[actor]?.length || 0) > 0) {
          const idx = Math.floor(Math.random() * updatedHands[actor].length);
          stolenCards.push(updatedHands[actor][idx]);
          updatedHands[actor] = updatedHands[actor].filter((_, i) => i !== idx);
        }
      });

      updatedHands[currentMyActor] = [...(updatedHands[currentMyActor] || []), ...stolenCards].sort((a,b) => a.rank - b.rank);
      setHands(updatedHands);

      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        setTrickOwner(currentMyActor);
        setTurn(currentMyActor);
        broadcastState({
          hands: updatedHands,
          turn: currentMyActor,
          trick: [],
          trickOwner: currentMyActor,
          passedActors: [],
          is11Back: false
        });
      }, 1000);
    } else if (abilityId === 'trick_master') {
      addLog(`【支配者】場を強制的に流した！`);
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        setTrickOwner(currentMyActor);
        setTurn(currentMyActor);
        broadcastState({
          hands,
          turn: currentMyActor,
          trick: [],
          trickOwner: currentMyActor,
          passedActors: [],
          is11Back: false
        });
      }, 1000);
    } else if (abilityId === 'rensa') {
      addLog(`【連撃】次のプレイの直後、もう一度自分の番になる！`);
      setRensaPendingActor(currentMyActor);
      broadcastState({ rensaPendingActor: currentMyActor });
    } else if (abilityId === 'kandatsu') {
      const targets = ACTORS.filter(a => a !== currentMyActor && (hands[a]?.length || 0) > 0);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const targetHand = [...(hands[target] || [])].sort((a, b) => b.rank - a.rank);
        const stolen = targetHand[0];
        addLog(`【強奪】${getActorName(target)} から最強のカードを奪った！`);
        setHands(prev => {
          const u = {
            ...prev,
            [target]: prev[target].filter(c => c.id !== stolen.id),
            [currentMyActor]: [...(prev[currentMyActor] || []), stolen].sort((a, b) => a.rank - b.rank)
          };
          broadcastState({ hands: u });
          return u;
        });
      } else {
        addLog(`【強奪】対象がいなかった…`);
      }
    } else if (abilityId === 'tefuda_senkyo') {
      addLog(`【手札厳選】捨てるカードを3枚選んでください。`);
      setSelectedIds(new Set());
      setNextTurnAfterSpecial(currentMyActor);
      const mulliganTurn = `${currentMyActor}_mulligan` as TurnState;
      setTurn(mulliganTurn);
      broadcastState({ turn: mulliganTurn, nextTurnAfterSpecial: currentMyActor });
    } else if (abilityId === 'shinkakumei') {
      const newRev = !isRevolution;
      addLog(`【即革命】強制的に革命を発動した！`);
      setIsRevolution(newRev);
      broadcastState({ isRevolution: newRev });
    } else if (abilityId === 'bourei') {
      const targets = ACTORS.filter(a => a !== currentMyActor && (hands[a]?.length || 0) > 0);
      if (targets.length > 0) {
        const leader = targets.reduce((min, a) => (hands[a].length < hands[min].length ? a : min), targets[0]);
        const leaderHand = [...(hands[leader] || [])];
        const discardNum = Math.min(2, leaderHand.length);
        const shuffled = [...leaderHand].sort(() => Math.random() - 0.5);
        const toDiscard = new Set(shuffled.slice(0, discardNum).map(c => c.id));
        addLog(`【亡霊の一手】${getActorName(leader)} の手札を${discardNum}枚強制的に捨てさせた！`);
        setHands(prev => {
          const u = {
            ...prev,
            [leader]: prev[leader].filter(c => !toDiscard.has(c.id))
          };
          broadcastState({ hands: u });
          return u;
        });
      } else {
        addLog(`【亡霊の一手】対象がいなかった…`);
      }
    }
  };

  const handleNextPhaseFromSummary = () => {
    if (!roundSummary) return;

    const newScores = { ...gameState.scores };
    const newRanks = { ...gameState.ranks };

    roundSummary.rankings.forEach(r => {
      newScores[r.actor] = r.totalPts;
      newRanks[r.actor] = r.rankTitle;
    });

    const playerGoldGain = roundSummary.rankings.find(r => r.actor === currentMyActor)?.gold || 0;
    const nextPhase = roundSummary.isGameCleared ? 'victory' : roundSummary.isGameOver ? 'gameover' : 'shop';

    setGameState(prev => ({
      ...prev,
      scores: newScores,
      ranks: newRanks,
      lastWinner: roundSummary.winner,
      gold: prev.gold + playerGoldGain,
      phase: nextPhase
    }));

    if (roomInfo) {
      socketService.syncGameState({
        phase: nextPhase,
        scores: newScores,
        ranks: newRanks,
        gold: gameState.gold + playerGoldGain
      });
    }
  };

  // Evaluate currently selected cards for Player
  const selectedCards = (hands[currentMyActor] || []).filter(c => selectedIds.has(c.id));
  const hasThreeCardRevolution = (gameState.abilities[currentMyActor] || []).some(a => a.id === 'three_card_revolution');
  const proposedPlay = evaluatePlay(selectedCards, effectiveReversed, hasThreeCardRevolution);

  const effectiveTopPlay = (trickOwner === currentMyActor || trick.length === 0 || !trickOwner) ? null : currentTopPlay;
  let isValid = false;
  let validationMessage = '';

  if (selectedCards.length === 0) {
    validationMessage = 'カードを選択してください';
  } else if (!proposedPlay) {
    validationMessage = '組み合わせが無効です（単体、ペア、トリプル、階段等）';
  } else if (!canPlay(proposedPlay, effectiveTopPlay, effectiveReversed)) {
    if (effectiveTopPlay && proposedPlay.count !== effectiveTopPlay.count) {
      validationMessage = `場の枚数 (${effectiveTopPlay.count}枚) と合わせてください`;
    } else if (effectiveTopPlay && proposedPlay.type !== effectiveTopPlay.type) {
      validationMessage = `場の役 (${effectiveTopPlay.type}) に合わせてください`;
    } else {
      validationMessage = effectiveReversed ? '場のカードより強い（数字が小さい）カードを出してください' : '場のカードより強いカードを出してください';
    }
  } else {
    isValid = true;
    if (proposedPlay.has8) validationMessage = '⚔️ 8切り発動可能！';
    else if (proposedPlay.has7) validationMessage = '🎁 7渡し発動可能！';
    else if (proposedPlay.has10) validationMessage = '🃏 10捨て発動可能！';
    else if (proposedPlay.has11) validationMessage = '🌀 11バック発動可能！';
    else if (proposedPlay.isRevolution) validationMessage = '⚡ 革命発動可能！';
    else validationMessage = '✅ カードを出せます';
  }

  const sortedActorsForScore = [...ACTORS].sort((a, b) => (gameState.scores[b] || 0) - (gameState.scores[a] || 0));

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col md:flex-row font-pixel overflow-hidden relative select-none">
      {/* LEFT SIDEBAR PANEL */}
      <div className="order-2 md:order-none w-full md:w-56 lg:w-64 bg-[#111113] border-t-4 md:border-t-0 md:border-b-0 md:border-r-4 border-[#222] p-3 flex flex-col justify-between shrink-0 z-30 space-y-3">
        <div className="space-y-3">
          {/* SCORE BOARD */}
          <div className="bg-black/90 border-2 border-[#333] p-3 rounded-lg shadow-inner">
            <div className="text-white font-pixel text-xs tracking-widest mb-2 border-b border-white/20 pb-1 flex justify-between items-center">
              <span>SCORE</span>
              <span className="text-amber-400 font-bold">ROUND {gameState.round}</span>
            </div>
            <div className="space-y-1 font-pixel text-xs">
              {sortedActorsForScore.map((actor, idx) => {
                const isMe = actor === currentMyActor;
                const score = gameState.scores[actor] || 0;
                const name = getActorName(actor).replace(' (あなた)', '');
                return (
                  <div key={actor} className={cn("flex justify-between items-center py-0.5", isMe ? "text-amber-400 font-bold" : "text-slate-300")}>
                    <span className="truncate max-w-[120px]">{idx + 1}. {name}</span>
                    <span className="font-pixel text-amber-300 ml-2">{score} pt</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVE STATUS FLAGS */}
          <div className="flex flex-wrap gap-1.5">
            {isRevolution && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                ⚡ 革命中
              </span>
            )}
            {is11Back && (
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/50 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                🌀 11バック中
              </span>
            )}
            {!isRevolution && !is11Back && (
              <span className="bg-slate-800/80 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[10px]">
                通常状態
              </span>
            )}
          </div>

          {/* ACTIVE ABILITIES PANEL */}
          {activeAbilities.length > 0 && (
            <div className="bg-black/60 border border-[#222] p-2 rounded-lg space-y-1.5">
              <span className="text-[10px] text-amber-400 font-bold block border-b border-white/10 pb-1 flex justify-between items-center">
                <span>アクティブ能力</span>
                <span className="text-[9px] text-slate-500">1回使い切り</span>
              </span>
              <div className="space-y-1">
                {activeAbilities.map(abil => (
                  <button
                    key={abil.id}
                    onClick={() => handleActiveAbility(abil.id)}
                    disabled={abil.isUsed || turn !== currentMyActor}
                    title={abil.description}
                    className={cn(
                      "w-full text-left p-1.5 rounded text-[11px] font-bold transition-all flex items-center justify-between border",
                      abil.isUsed
                        ? "bg-slate-900/50 text-slate-600 border-slate-800"
                        : turn === currentMyActor
                        ? "bg-amber-950/60 text-amber-300 border-amber-500/40 hover:bg-amber-900/80 cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                        : "bg-slate-800/40 text-slate-400 border-slate-700 opacity-60"
                    )}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <AbilityIcon id={abil.id} size={13} className="shrink-0" />
                      {abil.name}
                    </span>
                    <span className="text-[9px] shrink-0 ml-1 font-mono">{abil.isUsed ? '使用済' : '発動'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PASSIVE ABILITIES PANEL */}
          {passiveAbilities.length > 0 && (
            <div className="bg-black/60 border border-[#222] p-2 rounded-lg space-y-1.5">
              <span className="text-[10px] text-sky-400 font-bold block border-b border-white/10 pb-1 flex justify-between items-center">
                <span>パッシブ能力</span>
                <span className="text-[9px] text-sky-400/80">常時有効</span>
              </span>
              <div className="space-y-1">
                {passiveAbilities.map(abil => (
                  <div
                    key={abil.id}
                    title={abil.description}
                    className="w-full text-left p-1.5 rounded text-[11px] font-bold bg-sky-950/40 text-sky-200 border border-sky-500/40 flex items-center justify-between"
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <AbilityIcon id={abil.id} size={13} className="shrink-0" />
                      {abil.name}
                    </span>
                    <span className="text-[9px] shrink-0 ml-1 text-sky-400 bg-sky-950 border border-sky-500/50 px-1 rounded">常時</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOGS LIST */}
          <div className="bg-black/80 border border-[#222] p-2 rounded-lg h-32 overflow-y-auto space-y-1 font-sans text-[11px] leading-tight text-slate-300">
            {logs.map((log, i) => (
              <div key={i} className="border-b border-white/5 pb-0.5 text-slate-400">
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* MULTIPLAYER / LEAVE BUTTON */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          {roomInfo && (
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded text-xs font-pixel flex items-center justify-center gap-1.5 border border-slate-600 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>チャット ({chatMessages.length})</span>
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm(isHost ? '対戦を中断してメインメニューに戻りますか？' : '対戦から退出しますか？')) {
                if (isHost && roomInfo) socketService.disbandRoom('ホストにより解散されました。');
                setGameState(prev => ({ ...prev, phase: 'menu' }));
              }
            }}
            className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-400 py-1.5 px-3 rounded text-xs font-pixel flex items-center justify-center gap-1.5 border border-red-800/60 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>撤退 / 終了</span>
          </button>
        </div>
      </div>

      {/* CENTER PLAY MAT / MAIN GAME BOARD */}
      <div className="order-1 md:order-none flex-1 bg-[#0a0a0c] relative flex flex-col justify-between p-2 md:p-6 overflow-hidden">
        {/* LEAVE NOTICE */}
        {leaveNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border-2 border-red-500 text-white px-4 py-2 rounded-lg shadow-2xl font-pixel text-xs animate-bounce">
            {leaveNotice}
          </div>
        )}

        {/* TOP ACTOR (CPU / ONLINE) */}
        <div className="flex flex-col items-center z-10 space-y-1">
          <div className={cn(
            "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 transition-all",
            turn === top ? "bg-amber-500 text-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-105" : "bg-black/80 text-slate-400 border-slate-700"
          )}>
            <span>{getActorName(top)}</span>
            <span className="text-[10px] opacity-80">({hands[top]?.length || 0}枚)</span>
            {finishedActors.includes(top) && <span className="text-amber-300">👑 完</span>}
            {myAbilities.some(a => a.id === 'clairvoyance') && (
              <span className="text-[9px] bg-sky-950 text-sky-300 border border-sky-500 px-1 rounded font-bold">👁️ 透視</span>
            )}
          </div>

          {myAbilities.some(a => a.id === 'clairvoyance') ? (
            <div className="flex -space-x-3 overflow-x-auto max-w-full px-2 py-1 bg-black/50 border border-sky-500/40 rounded-lg">
              {(hands[top] || []).map((card, idx) => (
                <div key={card.id || idx} className="scale-75 origin-center">
                  <PlayingCard card={card} disabled />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex -space-x-4">
              {Array.from({ length: Math.min(hands[top]?.length || 0, 10) }).map((_, idx) => (
                <div key={idx} className="w-7 h-10 bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 rounded shadow" />
              ))}
            </div>
          )}
        </div>

        {/* MIDDLE SECTION (LEFT ACTOR, CENTER TRICK MAT, RIGHT ACTOR) */}
        <div className="flex-1 flex items-center justify-between my-2 relative">
          {/* LEFT ACTOR */}
          <div className="flex flex-col items-center z-10 space-y-1 w-24">
            <div className={cn(
              "px-2 py-1 rounded-full text-[10px] font-bold border text-center transition-all truncate max-w-full",
              turn === left ? "bg-amber-500 text-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-105" : "bg-black/80 text-slate-400 border-slate-700"
            )}>
              {getActorName(left)}
            </div>
            <span className="text-[10px] text-slate-400 font-pixel">{hands[left]?.length || 0}枚</span>
            {finishedActors.includes(left) && <span className="text-amber-300 text-[10px]">👑 完</span>}
            {myAbilities.some(a => a.id === 'clairvoyance') ? (
              <div className="flex flex-col items-center gap-1 max-h-[420px] overflow-y-auto p-1 bg-black/50 border border-sky-500/40 rounded-lg py-3">
                {(hands[left] || []).map((card, idx) => (
                  <div key={card.id || idx} className="w-[84px] h-[62px] flex items-center justify-center shrink-0">
                    <div className="scale-75 origin-center rotate-90">
                      <PlayingCard card={card} disabled />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col -space-y-4 my-2">
                {Array.from({ length: Math.min(hands[left]?.length || 0, 6) }).map((_, idx) => (
                  <div key={idx} className="w-10 h-7 bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 rounded shadow rotate-90 origin-center" />
                ))}
              </div>
            )}
          </div>

          {/* CENTER TRICK BOARD */}
          <div className="flex-1 max-w-lg h-56 mx-2 bg-[#121215] border-2 border-[#282830] rounded-2xl flex flex-col items-center justify-center relative p-3 shadow-2xl overflow-hidden">
            <div className="absolute top-2 left-3 text-[10px] font-pixel text-slate-500 uppercase tracking-widest">
              TRICK BOARD {trickOwner && `• LEAD: ${getActorName(trickOwner)}`}
            </div>

            {/* CARDS PLAYED ON TRICK */}
            {currentTopPlay ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center justify-center -space-x-3">
                  {currentTopPlay.cards.map((card, idx) => (
                    <motion.div
                      key={card.id || idx}
                      initial={{ y: -20, opacity: 0, rotate: (idx - currentTopPlay.cards.length / 2) * 5 }}
                      animate={{ y: 0, opacity: 1, rotate: (idx - currentTopPlay.cards.length / 2) * 5 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <PlayingCard card={card} />
                    </motion.div>
                  ))}
                </div>
                <div className="bg-black/80 border border-slate-700 px-3 py-0.5 rounded-full text-xs font-pixel text-amber-300">
                  {getPlayTypeName(currentTopPlay)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 space-y-1">
                <span className="text-xs font-pixel text-slate-500">場は流れています（自由に出せます）</span>
              </div>
            )}
          </div>

          {/* RIGHT ACTOR */}
          <div className="flex flex-col items-center z-10 space-y-1 w-24">
            <div className={cn(
              "px-2 py-1 rounded-full text-[10px] font-bold border text-center transition-all truncate max-w-full",
              turn === right ? "bg-amber-500 text-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-105" : "bg-black/80 text-slate-400 border-slate-700"
            )}>
              {getActorName(right)}
            </div>
            <span className="text-[10px] text-slate-400 font-pixel">{hands[right]?.length || 0}枚</span>
            {finishedActors.includes(right) && <span className="text-amber-300 text-[10px]">👑 完</span>}
            {myAbilities.some(a => a.id === 'clairvoyance') ? (
              <div className="flex flex-col items-center gap-1 max-h-[420px] overflow-y-auto p-1 bg-black/50 border border-sky-500/40 rounded-lg py-3">
                {(hands[right] || []).map((card, idx) => (
                  <div key={card.id || idx} className="w-[84px] h-[62px] flex items-center justify-center shrink-0">
                    <div className="scale-75 origin-center -rotate-90">
                      <PlayingCard card={card} disabled />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col -space-y-4 my-2">
                {Array.from({ length: Math.min(hands[right]?.length || 0, 6) }).map((_, idx) => (
                  <div key={idx} className="w-10 h-7 bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 rounded shadow -rotate-90 origin-center" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM SECTION (PLAYER CARDS & CONTROLS) */}
        <div className="bg-[#121215] border-2 border-[#222] p-3 rounded-2xl flex flex-col space-y-2 z-20">
          {/* PLAYER STATUS HEADER */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                turn === bottom || turn.startsWith(`${bottom}_`)
                  ? "bg-amber-500 text-black border-amber-300 font-black animate-pulse"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              )}>
                {turn === bottom ? '★ あなたの番' : turn === `${bottom}_pass_7` ? '🎁 7渡しモード' : turn === `${bottom}_discard_10` ? '🃏 10捨てモード' : turn === `${bottom}_mulligan` ? '🔄 手札厳選モード' : getActorName(bottom)}
              </span>
              <span className="text-xs text-slate-400 font-pixel">手札: {hands[bottom]?.length || 0}枚</span>
            </div>

            {/* SELECTION / VALIDATION HINT */}
            <div className="text-xs font-pixel font-bold">
              {turn === bottom && (
                <span className={cn(isValid ? "text-emerald-400" : "text-amber-400/80")}>
                  {validationMessage}
                </span>
              )}
            </div>
          </div>

          {/* PLAYER HAND CARDS CONTAINER */}
          <div className="flex items-center justify-center flex-wrap gap-1 md:gap-2 max-h-40 overflow-y-auto p-1">
            <AnimatePresence>
              {(hands[bottom] || []).map((card) => {
                const isSelected = selectedIds.has(card.id);
                const isMyTurn = turn.startsWith(bottom);
                return (
                  <motion.div
                    key={card.id}
                    layout
                    whileHover={isMyTurn ? { y: -6 } : undefined}
                    whileTap={isMyTurn ? { scale: 0.95 } : undefined}
                    onClick={() => toggleCardSelection(card.id)}
                    className="cursor-pointer"
                  >
                    <PlayingCard
                      card={card}
                      isSelected={isSelected}
                      disabled={!isMyTurn}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* ACTION BUTTONS (PLAY / PASS / CLEAR) */}
          <div className="flex items-center justify-center gap-4 pt-1">
            {turn === bottom && (
              <>
                <button
                  onClick={attemptPlayerPlay}
                  disabled={!isValid || selectedIds.size === 0}
                  className="font-pixel text-lg md:text-xl font-black bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-6 py-2 rounded-xl shadow-lg border-2 border-red-400/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  <span>Play (出す)</span>
                  <ArrowRight className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    if (trickOwner === bottom) {
                      setTrickOwner(null);
                      setTrick([]);
                    } else {
                      handlePass(bottom);
                    }
                  }}
                  disabled={trickOwner === bottom}
                  className="font-pixel text-base md:text-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2 rounded-xl border border-slate-600 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 cursor-pointer"
                >
                  Pass (パス)
                </button>

                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="font-pixel text-xs text-slate-400 hover:text-slate-200 underline px-2 py-1 cursor-pointer"
                  >
                    選択解除
                  </button>
                )}
              </>
            )}

            {turn === `${bottom}_pass_7` && (
              <button
                onClick={attemptPlayerPass7}
                disabled={selectedIds.size !== Math.min(Math.max(1, passCount7), hands[bottom]?.length || 1)}
                className="font-pixel text-lg text-blue-300 font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 bg-blue-950/80 border-2 border-blue-500 px-6 py-2 rounded-xl cursor-pointer shadow-lg"
              >
                カードを渡す ({selectedIds.size}/{Math.min(Math.max(1, passCount7), hands[bottom]?.length || 1)})
              </button>
            )}

            {turn === `${bottom}_discard_10` && (
              <button
                onClick={attemptPlayerDiscard10}
                disabled={selectedIds.size === 0 || selectedIds.size > Math.min(Math.max(1, discardCount10), hands[bottom]?.length || 1)}
                className="font-pixel text-lg text-rose-300 font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 bg-rose-950/80 border-2 border-rose-500 px-6 py-2 rounded-xl cursor-pointer shadow-lg"
              >
                カードを捨てる ({selectedIds.size}/{Math.min(Math.max(1, discardCount10), hands[bottom]?.length || 1)})
              </button>
            )}

            {turn === `${bottom}_mulligan` && (
              <button
                onClick={attemptPlayerMulligan}
                disabled={selectedIds.size !== Math.min(3, hands[bottom]?.length || 0)}
                className="font-pixel text-lg text-purple-300 font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 bg-purple-950/80 border-2 border-purple-500 px-6 py-2 rounded-xl cursor-pointer shadow-lg"
              >
                入れ替える ({selectedIds.size}/{Math.min(3, hands[bottom]?.length || 0)})
              </button>
            )}

            {turn !== bottom && !turn.startsWith(`${bottom}_`) && turn !== 'trick_end' && (
              <div className="font-pixel text-sm text-slate-400 flex items-center gap-2 animate-pulse py-1">
                <span>{getActorName((turn.includes('_') ? turn.split('_')[0] : turn) as Actor)} の思考中...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SCREEN EFFECTS OVERLAY (full-screen, dramatic) */}
      <AnimatePresence>
        {screenEffect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none p-4"
          >
            <motion.div
              initial={{ scale: 0.2, opacity: 0, rotate: -8 }}
              animate={{ scale: [0.2, 1.25, 1], opacity: 1, rotate: 0 }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.5, times: [0, 0.65, 1], ease: 'easeOut' }}
              className={cn(
                "text-center px-6 sm:px-12 py-8 sm:py-10 border-4 rounded-2xl bg-black/70 max-w-[95vw]",
                (EFFECT_STYLES[screenEffect.type] || EFFECT_STYLES.ability).border,
                (EFFECT_STYLES[screenEffect.type] || EFFECT_STYLES.ability).glow
              )}
            >
              <motion.h3
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className={cn(
                  "text-3xl sm:text-5xl md:text-6xl font-black tracking-wider mb-3 drop-shadow-[0_0_25px_currentColor]",
                  (EFFECT_STYLES[screenEffect.type] || EFFECT_STYLES.ability).text
                )}
              >
                {screenEffect.title}
              </motion.h3>
              <p className="text-sm sm:text-lg text-slate-100 font-pixel">{screenEffect.subtitle}</p>
              <span className="text-[10px] sm:text-xs text-slate-300/90 mt-3 font-pixel block tracking-widest">BY {screenEffect.actorName}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ROUND END RESULTS MODAL OVERLAY */}
      <AnimatePresence>
        {roundEnded && roundSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 font-pixel"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#121214] border-2 border-amber-500/50 max-w-lg w-full p-6 md:p-8 rounded-2xl shadow-2xl flex flex-col items-center space-y-6"
            >
              <div className="flex flex-col items-center space-y-1 text-center">
                <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">ROUND RESULT</span>
                <h2 className="text-2xl font-bold text-amber-400">第 {gameState.round} 戦 結果</h2>
              </div>

              {/* RANKING LIST */}
              <div className="w-full space-y-2">
                {roundSummary.rankings.map((res, i) => {
                  const isPlayer = res.actor === currentMyActor;
                  return (
                    <div
                      key={res.actor}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border text-xs transition-all",
                        isPlayer
                          ? "bg-amber-950/40 border-amber-500/50 text-amber-200"
                          : "bg-black/60 border-white/10 text-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-amber-400 w-4">{i + 1}.</span>
                        <div className="flex flex-col">
                          <span className="font-bold">{getActorName(res.actor)}</span>
                          <span className="text-[10px] text-amber-500">{res.rankTitle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-amber-300 font-bold">+{res.pts} pt</span>
                        <span className="text-yellow-400 text-[11px] flex items-center gap-1">
                          <Coins className="w-3 h-3" />+{res.gold}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* NEXT BUTTON */}
              <button
                onClick={handleNextPhaseFromSummary}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-lg py-3 rounded-xl shadow-lg border-2 border-amber-300 cursor-pointer transition-all hover:scale-102 active:scale-98"
              >
                {roundSummary.isGameCleared ? '最終勝利！リザルトへ' : roundSummary.isGameOver ? 'ゲームオーバー' : '次へ（ショップ / 第2戦）'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MULTIPLAYER CHAT MODAL */}
      {roomInfo && (
        <MultiplayerChat
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          chatMessages={chatMessages}
          myActor={currentMyActor}
        />
      )}
    </div>
  );
}
