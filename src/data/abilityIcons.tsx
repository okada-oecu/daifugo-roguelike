import {
  Eye, RefreshCw, Trash2, Layers, Sparkles, Ban, PlusCircle, Star,
  Rocket, Coins, Crown, ShieldCheck, Zap, Swords, Repeat, Hand,
  Shield, HeartHandshake, Ghost, type LucideIcon
} from 'lucide-react';
import { AbilityId } from '../types';

export const ABILITY_ICONS: Partial<Record<AbilityId, LucideIcon>> = {
  clairvoyance: Eye,
  three_card_revolution: RefreshCw,
  extra_discard: Trash2,
  draw_cards: Layers,
  strong_draw: Sparkles,
  skip_turn: Ban,
  heal: PlusCircle,
  joker_draw: Star,
  max_hp_up: Rocket,
  gold_rush: Coins,
  trick_master: Crown,
  defense_up: ShieldCheck,
  reversal_joker_burst: Zap,
  gekurou_reversal: Swords,
  gyakuten_emperor: Crown,
  rensa: Repeat,
  kandatsu: Hand,
  tefuda_senkyo: RefreshCw,
  shinkakumei: Zap,
  teppeki: Shield,
  kane_no_saihai: Coins,
  fukutsu: HeartHandshake,
  bourei: Ghost,
};

export function AbilityIcon({ id, className, size }: { id: AbilityId; className?: string; size?: number }) {
  const Icon = ABILITY_ICONS[id] || Sparkles;
  return <Icon className={className} size={size} />;
}
