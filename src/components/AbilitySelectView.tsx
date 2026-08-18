import React, { useState, useEffect } from 'react';
import { GameState, Ability } from '../types';
import { RoomInfo } from '../types/multiplayer';
import { socketService } from '../services/socket';
import { Sparkles, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ALL_ABILITIES: Ability[] = [
  { id: 'clairvoyance', name: '透視', description: '敵の手札が常に全て見えるようになる。', type: 'passive' },
  { id: 'three_card_revolution', name: '革命家', description: '同じ数字のカード3枚で革命を起こせるようになる。', type: 'passive' },
  { id: 'extra_discard', name: '断捨離', description: '10を出した時、捨てるカードの枚数が1枚増える。', type: 'passive' },
  { id: 'draw_cards', name: 'ドロー', description: '戦闘中1回のみ、山札からカードを2枚引く。', type: 'active' },
  { id: 'strong_draw', name: '豪運', description: '戦闘中1回のみ、強さ8以上のカードを2枚引く。', type: 'active' },
  { id: 'skip_turn', name: '威圧', description: '戦闘中1回のみ、敵1体のターンを強制的にパスさせる。', type: 'active' },
  { id: 'heal', name: 'カード補充', description: '戦闘中1回のみ、山札からカードを2枚追加で補充する。', type: 'active' },
  { id: 'joker_draw', name: 'ジョーカー召喚', description: '戦闘中1回のみ、ジョーカーを1枚手札に加える。', type: 'active' },
  { id: 'trick_master', name: '支配者', description: '戦闘中1回のみ、場を強制的に流し自分のターンにする。', type: 'active' },
  { id: 'max_hp_up', name: 'スタートダッシュ', description: '初期スコアが+2ptされた状態でゲームが始まる。', type: 'passive' },
  { id: 'gold_rush', name: 'ゴールドラッシュ', description: 'ラウンド終了時に得られるゴールドが+50される。', type: 'passive' },
  { id: 'defense_up', name: '都落ちガード', description: '都落ちが発生した際、手札消失を防ぎ通常順位で継続する。', type: 'passive' },
  { id: 'rensa', name: '連撃', description: '戦闘中1回のみ、次に出したプレイの直後、もう一度自分の番になる。', type: 'active' },
  { id: 'kandatsu', name: '強奪', description: '戦闘中1回のみ、ランダムな敵1体から一番強いカードを1枚奪う。', type: 'active' },
  { id: 'tefuda_senkyo', name: '手札厳選', description: '戦闘中1回のみ、手札から好きな3枚を捨てて新しく3枚引き直す。', type: 'active' },
  { id: 'shinkakumei', name: '即革命', description: '戦闘中1回のみ、手札構成に関係なくその場で革命を発動する。', type: 'active' },
  { id: 'teppeki', name: '鉄壁', description: '7渡しで相手に渡すカードの枚数が1枚減る（最低1枚）。', type: 'passive' },
  { id: 'kane_no_saihai', name: '金の采配', description: 'ショップでの能力購入価格が常に2割引になる。', type: 'passive' },
  { id: 'fukutsu', name: '不屈の精神', description: '都落ちで大貧民になった場合、そのラウンドのゴールド獲得量に+30される。', type: 'passive' }
];

interface AbilitySelectViewProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  roomInfo?: RoomInfo | null;
  myActor?: string;
}

export function AbilitySelectView({ gameState, setGameState, roomInfo, myActor = 'player' }: AbilitySelectViewProps) {
  const currentMyActor = (['player', 'enemy1', 'enemy2', 'enemy3'].includes(myActor) ? myActor : 'player') as 'player' | 'enemy1' | 'enemy2' | 'enemy3';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [availableAbilities, setAvailableAbilities] = useState<Ability[]>([]);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [readyStatus, setReadyStatus] = useState<{ readyCount: number; totalCount: number } | null>(null);

  useEffect(() => {
    // Randomly select 6 abilities on mount
    const shuffled = [...ALL_ABILITIES].sort(() => Math.random() - 0.5);
    setAvailableAbilities(shuffled.slice(0, 6));
  }, []);

  useEffect(() => {
    if (roomInfo) {
      const unsubReadyUpdated = socketService.onPhaseReadyUpdated(({ phase, readyCount, totalCount }) => {
        if (phase === 'ability_select') {
          setReadyStatus({ readyCount, totalCount });
        }
      });

      const unsubAllReady = socketService.onAllPlayersPhaseReady(({ phase }) => {
        if (phase === 'ability_select') {
          setGameState(prev => ({ ...prev, phase: 'combat' }));
        }
      });

      return () => {
        unsubReadyUpdated?.();
        unsubAllReady?.();
      };
    }
  }, [roomInfo, setGameState]);

  const toggleAbility = (id: string) => {
    if (isWaiting) return;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      if (newSelected.size < 3) {
        newSelected.add(id);
      }
    }
    setSelectedIds(newSelected);
  };

  const confirmSelection = () => {
    if (selectedIds.size === 3) {
      const chosenAbilities = availableAbilities.filter(a => selectedIds.has(a.id));

      const updatedScores = { ...gameState.scores };
      if (selectedIds.has('max_hp_up')) {
        updatedScores[currentMyActor] = (updatedScores[currentMyActor] || 0) + 2;
      }

      const formattedAbilities = chosenAbilities.map(a => ({ ...a, isUsed: false }));

      setGameState(prev => ({
        ...prev,
        scores: updatedScores,
        abilities: { ...prev.abilities, [currentMyActor]: formattedAbilities }
      }));

      if (roomInfo) {
        setIsWaiting(true);
        // Sync only this actor's own key — the server deep-merges abilities/scores
        // per actor, so concurrent selections from other players never get clobbered
        // by whichever sync happens to land last.
        socketService.syncGameState({
          abilities: { [currentMyActor]: formattedAbilities },
          scores: { [currentMyActor]: updatedScores[currentMyActor] }
        });
        socketService.sendPhaseReady('ability_select');
      } else {
        setGameState(prev => ({
          ...prev,
          phase: 'combat'
        }));
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-pixel select-none relative">
      <div className="max-w-3xl w-full bg-[#0a0a0a] border-4 border-zinc-800 p-6 sm:p-8 flex flex-col items-center space-y-6 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="text-center space-y-2 relative z-10">
          <div className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500 text-amber-400 text-[10px] font-bold tracking-widest">
            PERK SELECTION
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-amber-400 glitch-play-text">
            能力選択
          </h2>
          <p className="text-[11px] text-zinc-400">
            冒険に持ち込む能力を <span className="text-amber-400 font-bold">3つ</span> 選んでください
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full relative z-10">
          {availableAbilities.map(ability => {
            const isSelected = selectedIds.has(ability.id);
            return (
              <button
                key={ability.id}
                onClick={() => toggleAbility(ability.id)}
                disabled={isWaiting}
                className={cn(
                  "p-3.5 border-4 text-left transition-all flex flex-col gap-2 cursor-pointer relative disabled:cursor-not-allowed disabled:opacity-50",
                  isSelected
                    ? "bg-amber-950/40 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    : "bg-zinc-950 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span className={cn("font-bold text-xs sm:text-sm", isSelected ? "text-amber-300" : "text-zinc-100")}>
                    {ability.name}
                  </span>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 border font-bold",
                    ability.type === 'passive' 
                      ? "bg-sky-950 border-sky-500 text-sky-300"
                      : "bg-red-950 border-red-500 text-red-300"
                  )}>
                    {ability.type === 'passive' ? '常時発動' : '使い切り'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">
                  {ability.description}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={confirmSelection}
          disabled={selectedIds.size !== 3 || isWaiting}
          className="relative z-10 w-full max-w-sm py-4 bg-red-600 disabled:bg-zinc-900 text-white disabled:text-zinc-600 font-bold text-xs tracking-widest border-4 border-black disabled:border-zinc-800 shadow-[0_4px_0_#000] disabled:shadow-none transition-transform active:translate-y-1 cursor-pointer disabled:cursor-not-allowed"
        >
          {isWaiting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} /> 他のプレイヤーを待機中...
            </span>
          ) : (
            selectedIds.size === 3 ? '決定して開始 [START]' : `あと ${3 - selectedIds.size} つ選択`
          )}
        </button>
      </div>

      {/* Waiting Overlay Modal for Multiplayer */}
      {isWaiting && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border-4 border-amber-500 p-6 sm:p-8 max-w-sm w-full text-center space-y-6 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-in fade-in">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-amber-500/30 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <Sparkles className="text-amber-400" size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-amber-400 tracking-wider">対戦相手を待機中</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                他のプレイヤーが能力を選択しています。<br />全員の準備が完了すると対戦が開始されます。
              </p>
            </div>
            <div className="bg-zinc-950 border-2 border-zinc-800 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">準備完了</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {readyStatus ? `${readyStatus.readyCount} / ${readyStatus.totalCount}` : '確認中...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
