import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CardData } from '../types';
import { getDisplayRank } from '../utils/daifugo';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PlayingCardProps {
  card: CardData;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  hidden?: boolean;
  isEnemy?: boolean;
  glowEffect?: 'gold' | 'revolution' | 'slash' | 'joker' | 'ability' | null;
}

export function PlayingCard({ card, isSelected, onClick, className, disabled, hidden, isEnemy, glowEffect }: PlayingCardProps) {
  const isJoker = card.rank === 16;
  const isRed = card.suit === '♥' || card.suit === '♦';
  const displayRank = getDisplayRank(card.rank);

  const getGlowStyles = () => {
    if (glowEffect === 'revolution') return "shadow-[0_0_25px_rgba(225,29,72,0.8)] border-rose-500 animate-pulse";
    if (glowEffect === 'slash') return "shadow-[0_0_25px_rgba(56,189,248,0.8)] border-sky-400";
    if (glowEffect === 'ability') return "shadow-[0_0_25px_rgba(234,179,8,0.9)] border-amber-300 animate-pulse";
    if (glowEffect === 'joker' || isJoker) return "shadow-[0_0_20px_rgba(168,85,247,0.7)] border-purple-400";
    if (glowEffect === 'gold') return "shadow-[0_0_20px_rgba(245,158,11,0.7)] border-amber-400";
    return "";
  };

  if (hidden) {
    return (
      <div
        className={cn(
          "relative w-20 h-28 sm:w-24 sm:h-36 rounded-lg pixel-card-back border-2 border-black shadow-lg flex items-center justify-center overflow-hidden select-none",
          className
        )}
      >
        <div className="w-10 h-14 border-2 border-white/40 bg-white/10 rounded-md flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-white/30"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "relative w-20 h-28 sm:w-24 sm:h-36 rounded-lg shadow-xl flex flex-col p-2 select-none transition-all duration-200 border-2 overflow-hidden bg-white",
        isSelected 
          ? "border-red-600 border-[3px] shadow-[0_0_20px_rgba(239,68,68,0.8)] -translate-y-4 font-bold scale-105" 
          : isJoker 
            ? "bg-gradient-to-br from-purple-100 via-pink-100 to-purple-200 border-purple-500"
            : "border-slate-800 text-slate-900",
        getGlowStyles(),
        isJoker ? "text-purple-800" : isRed ? "text-red-600" : "text-black",
        disabled ? "opacity-90 cursor-default" : "cursor-pointer hover:shadow-2xl hover:-translate-y-1",
        className
      )}
    >
      {/* Joker Shimmer Effect */}
      {isJoker && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
      )}

      <div className={cn("font-pixel font-bold leading-none z-10 tracking-tighter", isJoker ? "text-[10px]" : "text-base sm:text-lg")}>
        {displayRank}
      </div>
      <div className="text-3xl sm:text-4xl leading-none flex-grow flex items-center justify-center z-10 font-bold drop-shadow-sm">
        {card.suit}
      </div>
      <div className={cn("font-pixel font-bold leading-none self-end rotate-180 z-10 tracking-tighter", isJoker ? "text-[10px]" : "text-base sm:text-lg")}>
        {displayRank}
      </div>
    </div>
  );
}
