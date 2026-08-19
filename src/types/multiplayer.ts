import { Actor, CardData, GameState, Play, RankTitle, TurnState, Ability, GameSettings } from '../types';

export interface RoomPlayer {
  id: string; // socket id or 'cpu_x'
  name: string;
  actor: Actor;
  isReady: boolean;
  isHost: boolean;
  isCpu: boolean;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderActor: Actor;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface MultiplayerHand {
  [actor: string]: CardData[];
}

export interface MultiplayerScores {
  [actor: string]: number;
}

export interface MultiplayerRanks {
  [actor: string]: RankTitle;
}

export interface MultiplayerAbilities {
  [actor: string]: Ability[];
}

export interface MultiplayerDecks {
  [actor: string]: CardData[];
}

export interface RoomGameState {
  phase: 'ability_select' | 'combat' | 'shop' | 'round_end' | 'gameover' | 'victory';
  round: number;
  scores: Record<Actor, number>;
  ranks: Record<Actor, RankTitle>;
  gold: Record<Actor, number>;
  decks: Record<Actor, CardData[]>;
  abilities: Record<Actor, Ability[]>;
  hands: Record<Actor, CardData[]>;
  turn: TurnState;
  trick: Play[];
  trickOwner: Actor | null;
  isRevolution: boolean;
  is11Back: boolean;
  passedActors: Actor[];
  finishedActors: Actor[];
  logs: string[];
  passCount7: number;
  discardCount10: number;
  nextTurnAfterSpecial: Actor | null;
  shopReady: Record<Actor, boolean>;
  abilitySelectReady: Record<Actor, boolean>;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  status: 'waiting' | 'in_game';
  gameState: RoomGameState | null;
  chatMessages: ChatMessage[];
  settings: GameSettings;
}
