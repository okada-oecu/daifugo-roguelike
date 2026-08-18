import { canPlay, evaluatePlay } from './src/utils/daifugo.ts';

const p1 = evaluatePlay([
  { id: '1', suit: '♠', rank: 3 },
  { id: '2', suit: '♥', rank: 3 },
  { id: '3', suit: '♦', rank: 3 },
  { id: '4', suit: '♣', rank: 3 },
], false);

const p2 = evaluatePlay([
  { id: '5', suit: '♠', rank: 4 }
], false);

console.log('canPlay 1 on 4?', canPlay(p2!, p1!, false));
