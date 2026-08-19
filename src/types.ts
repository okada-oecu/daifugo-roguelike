export type Suit = '♠' | '♥' | '♦' | '♣' | '★';
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export interface CardData {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type PlayType = 'Single' | 'Group' | 'Sequence';

export interface Play {
  type: PlayType;
  count: number;
  strength: number;
  cards: CardData[];
  has7: boolean;
  count7: number;
  has8: boolean;
  has10: boolean;
  count10: number;
  has11: boolean;
  isRevolution: boolean;
}

export type GamePhase = 'menu' | 'multiplayer_lobby' | 'ability_select' | 'combat' | 'shop' | 'gameover' | 'victory';
export type Actor = 'player' | 'enemy1' | 'enemy2' | 'enemy3';
export type RankTitle = '大富豪' | '富豪' | '平民' | '貧民' | '大貧民';

export type TurnState =
  | Actor
  | `${Actor}_pass_7`
  | `${Actor}_discard_10`
  | `${Actor}_mulligan`
  | 'trick_end';

export type AbilityId =
  | 'clairvoyance'
  | 'three_card_revolution'
  | 'extra_discard'
  | 'draw_cards'
  | 'strong_draw'
  | 'skip_turn'
  | 'heal'
  | 'joker_draw'
  | 'shield'
  | 'max_hp_up'
  | 'gold_rush'
  | 'trick_master'
  | 'defense_up'
  | 'reversal_joker_burst'
  | 'gekurou_reversal'
  | 'gyakuten_emperor'
  | 'rensa'
  | 'kandatsu'
  | 'tefuda_senkyo'
  | 'shinkakumei'
  | 'teppeki'
  | 'kane_no_saihai'
  | 'fukutsu'
  | 'bourei';

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
  type: 'passive' | 'active';
  isUsed?: boolean;
  isRare?: boolean;
  price?: number;
}

export interface DaifugoRules {
  eightGiri: boolean;
  sevenPass: boolean;
  tenDiscard: boolean;
  elevenBack: boolean;
  revolution: boolean;
}

export const DEFAULT_RULES: DaifugoRules = {
  eightGiri: true,
  sevenPass: true,
  tenDiscard: true,
  elevenBack: true,
  revolution: true,
};

export interface GameSettings {
  scoreLimit: number;
  turnTimeLimit: number;
  rules: DaifugoRules;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  scoreLimit: 12,
  turnTimeLimit: 30,
  rules: DEFAULT_RULES,
};

export interface GameState {
  phase: GamePhase;
  round: number;
  scores: Record<Actor, number>;
  ranks: Record<Actor, RankTitle>;
  lastWinner: Actor | null;
  gold: number;
  playerDeck: CardData[];
  abilities: Record<Actor, Ability[]>;
  scoreLimit: number;
  turnTimeLimit: number;
  rules: DaifugoRules;
}

export const createEmptyAbilities = (): Record<Actor, Ability[]> => ({
  player: [],
  enemy1: [],
  enemy2: [],
  enemy3: [],
});
