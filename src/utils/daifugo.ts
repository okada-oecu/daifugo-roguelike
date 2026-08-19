import { CardData, Play, Rank, Suit, DaifugoRules, DEFAULT_RULES } from '../types';

/**
 * Get card strength.
 * Standard rank order in Daifugo: 3 (weakest: 3) to 2 (15) then Joker (16).
 * When reversed (Revolution / 11-Back): 2 (weakest: 15) to 3 (3), BUT Joker is always 999 (strongest).
 */
export const getCardStrength = (rank: Rank, isReversed: boolean): number => {
  if (rank === 16) return 999; // Joker is always absolute strongest
  return isReversed ? (18 - rank) : rank;
};

export const getDisplayRank = (rank: Rank): string => {
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

export const generateDeck = (): CardData[] => {
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  const ranks: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const deck: CardData[] = [];
  
  suits.forEach(suit => {
    ranks.forEach(rank => {
      deck.push({ id: crypto.randomUUID(), suit, rank });
    });
  });
  
  deck.push({ id: crypto.randomUUID(), suit: '★', rank: 16 });
  deck.push({ id: crypto.randomUUID(), suit: '★', rank: 16 });
  
  return deck;
};

export const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const createInitialPlayerDeck = (): CardData[] => {
  const full = generateDeck();
  const shuffled = shuffleArray(full);
  return shuffled.slice(0, 15);
};

export const createAllFourHands = (): Record<'player' | 'enemy1' | 'enemy2' | 'enemy3', CardData[]> => {
  const full = generateDeck();
  const shuffled = shuffleArray(full);
  return {
    player: shuffled.slice(0, 14).sort((a,b) => a.rank - b.rank),
    enemy1: shuffled.slice(14, 28).sort((a,b) => a.rank - b.rank),
    enemy2: shuffled.slice(28, 41).sort((a,b) => a.rank - b.rank),
    enemy3: shuffled.slice(41, 54).sort((a,b) => a.rank - b.rank),
  };
};

export const applyTaxExchange = (
  hands: Record<'player' | 'enemy1' | 'enemy2' | 'enemy3', CardData[]>,
  ranks: Record<'player' | 'enemy1' | 'enemy2' | 'enemy3', string>
): Record<'player' | 'enemy1' | 'enemy2' | 'enemy3', CardData[]> => {
  const newHands = {
    player: [...hands.player],
    enemy1: [...hands.enemy1],
    enemy2: [...hands.enemy2],
    enemy3: [...hands.enemy3],
  };

  const actors: ('player' | 'enemy1' | 'enemy2' | 'enemy3')[] = ['player', 'enemy1', 'enemy2', 'enemy3'];
  const daifugoActor = actors.find(a => ranks[a] === '大富豪');
  const daihinminActor = actors.find(a => ranks[a] === '大貧民');
  const hugoActor = actors.find(a => ranks[a] === '富豪');
  const hinminActor = actors.find(a => ranks[a] === '貧民');

  const sortByStrengthAsc = (cards: CardData[]) => {
    return [...cards].sort((a, b) => getCardStrength(a.rank, false) - getCardStrength(b.rank, false));
  };

  if (daifugoActor && daihinminActor && newHands[daifugoActor].length >= 2 && newHands[daihinminActor].length >= 2) {
    const sortedDaihinmin = sortByStrengthAsc(newHands[daihinminActor]);
    const strongest2 = sortedDaihinmin.slice(-2);
    const remainingDaihinmin = sortedDaihinmin.slice(0, -2);

    const sortedDaifugo = sortByStrengthAsc(newHands[daifugoActor]);
    const weakest2 = sortedDaifugo.slice(0, 2);
    const remainingDaifugo = sortedDaifugo.slice(2);

    newHands[daihinminActor] = [...remainingDaihinmin, ...weakest2].sort((a, b) => a.rank - b.rank);
    newHands[daifugoActor] = [...remainingDaifugo, ...strongest2].sort((a, b) => a.rank - b.rank);
  }

  if (hugoActor && hinminActor && newHands[hugoActor].length >= 1 && newHands[hinminActor].length >= 1) {
    const sortedHinmin = sortByStrengthAsc(newHands[hinminActor]);
    const strongest1 = sortedHinmin.slice(-1);
    const remainingHinmin = sortedHinmin.slice(0, -1);

    const sortedHugo = sortByStrengthAsc(newHands[hugoActor]);
    const weakest1 = sortedHugo.slice(0, 1);
    const remainingHugo = sortedHugo.slice(1);

    newHands[hinminActor] = [...remainingHinmin, ...weakest1].sort((a, b) => a.rank - b.rank);
    newHands[hugoActor] = [...remainingHugo, ...strongest1].sort((a, b) => a.rank - b.rank);
  }

  return newHands;
};

export const createEnemyHands = (floor: number, playerDeck: CardData[]): { enemy1: CardData[], enemy2: CardData[], enemy3: CardData[] } => {
  const full = generateDeck();
  const available = full.filter(c => 
    !playerDeck.some(pc => pc.suit === c.suit && pc.rank === c.rank)
  );
  
  const shuffled = shuffleArray(available);
  const size = Math.min(10 + Math.floor(floor / 2), Math.floor(available.length / 3));
  
  return {
    enemy1: shuffled.slice(0, size).sort((a,b) => a.rank - b.rank),
    enemy2: shuffled.slice(size, size * 2).sort((a,b) => a.rank - b.rank),
    enemy3: shuffled.slice(size * 2, size * 3).sort((a,b) => a.rank - b.rank),
  };
};

/**
 * Evaluate selected cards to determine if they form a valid play (Single, Group, Sequence).
 */
export const evaluatePlay = (cards: CardData[], isReversed: boolean, hasThreeCardRevolution: boolean = false, rules: DaifugoRules = DEFAULT_RULES): Play | null => {
  if (!cards || cards.length === 0) return null;

  const jokers = cards.filter(c => c.rank === 16);
  const nonJokers = cards.filter(c => c.rank !== 16);

  let has7 = false;
  let count7 = 0;
  let has8 = false;
  let has10 = false;
  let count10 = 0;
  let has11 = false;

  // Single card
  if (cards.length === 1) {
    const card = cards[0];
    if (card.rank === 7 && rules.sevenPass) { has7 = true; count7 = 1; }
    if (card.rank === 8 && rules.eightGiri) { has8 = true; }
    if (card.rank === 10 && rules.tenDiscard) { has10 = true; count10 = 1; }
    if (card.rank === 11 && rules.elevenBack) { has11 = true; }
    return {
      type: 'Single',
      count: 1,
      strength: getCardStrength(card.rank, isReversed),
      has7, count7, has8, has10, count10, has11,
      isRevolution: false,
      cards
    };
  }

  // All Jokers (e.g. 2 Jokers together)
  if (nonJokers.length === 0) {
    const isRev = rules.revolution && cards.length >= (hasThreeCardRevolution ? 3 : 4);
    return {
      type: 'Group',
      count: cards.length,
      strength: 999,
      has7: false, count7: 0, has8: false, has10: false, count10: 0, has11: false,
      isRevolution: isRev,
      cards
    };
  }

  // Group check (Pair, Triple, Quad, etc.) with Jokers as wildcards
  const targetRank = nonJokers[0].rank;
  const isGroup = nonJokers.every(c => c.rank === targetRank);

  if (isGroup) {
    has7 = targetRank === 7 && rules.sevenPass;
    count7 = (targetRank === 7 && rules.sevenPass) ? cards.length : 0;
    has8 = targetRank === 8 && rules.eightGiri;
    has10 = targetRank === 10 && rules.tenDiscard;
    count10 = (targetRank === 10 && rules.tenDiscard) ? cards.length : 0;
    has11 = targetRank === 11 && rules.elevenBack;
    const isRev = rules.revolution && cards.length >= (hasThreeCardRevolution ? 3 : 4);

    return {
      type: 'Group',
      count: cards.length,
      strength: getCardStrength(targetRank, isReversed),
      has7, count7, has8, has10, count10, has11,
      isRevolution: isRev,
      cards
    };
  }

  // Sequence check (Kaidan: 3 or more cards of same suit in consecutive ranks)
  if (cards.length >= 3) {
    const sameSuit = nonJokers.every(c => c.suit === nonJokers[0].suit);
    if (sameSuit) {
      const sortedNJ = [...nonJokers].sort((a, b) => a.rank - b.rank);
      let hasDuplicates = false;
      for (let i = 1; i < sortedNJ.length; i++) {
        if (sortedNJ[i].rank === sortedNJ[i - 1].rank) {
          hasDuplicates = true;
          break;
        }
      }

      if (!hasDuplicates) {
        const minR = sortedNJ[0].rank;
        const maxR = sortedNJ[sortedNJ.length - 1].rank;
        const totalCount = cards.length;

        const validStarts: number[] = [];
        for (let S = 3; S <= 15 - totalCount + 1; S++) {
          const E = S + totalCount - 1;
          if (S <= minR && E >= maxR) {
            validStarts.push(S);
          }
        }

        if (validStarts.length > 0) {
          // Sort valid starts by highest strength based on current reverse state
          validStarts.sort((a, b) => {
            const strA = getCardStrength((isReversed ? a : a + totalCount - 1) as Rank, isReversed);
            const strB = getCardStrength((isReversed ? b : b + totalCount - 1) as Rank, isReversed);
            return strB - strA;
          });

          const bestStart = validStarts[0];
          const bestEnd = bestStart + totalCount - 1;

          for (let r = bestStart; r <= bestEnd; r++) {
            if (r === 7 && rules.sevenPass) { has7 = true; count7 = 1; }
            if (r === 8 && rules.eightGiri) { has8 = true; }
            if (r === 10 && rules.tenDiscard) { has10 = true; count10 = 1; }
            if (r === 11 && rules.elevenBack) { has11 = true; }
          }

          const strongestRank = (isReversed ? bestStart : bestEnd) as Rank;

          return {
            type: 'Sequence',
            count: totalCount,
            strength: getCardStrength(strongestRank, isReversed),
            has7, count7, has8, has10, count10, has11,
            isRevolution: false,
            cards
          };
        }
      }
    }
  }

  return null;
};

export const getPlayStrength = (play: Play, isReversed: boolean): number => {
  const reEvaluated = evaluatePlay(play.cards, isReversed);
  return reEvaluated ? reEvaluated.strength : play.strength;
};

/**
 * Check if the attempted play is valid against current top play on trick.
 */
export const canPlay = (attempt: Play, trickTop: Play | null, isReversed: boolean): boolean => {
  if (!trickTop) return true; // Empty trick or lead turn -> Any valid play is allowed!

  // Special Rule: Spade 3 (♠3) beats Single Joker (スリースペード返し)
  if (
    trickTop.type === 'Single' &&
    trickTop.cards.some(c => c.rank === 16) &&
    attempt.type === 'Single' &&
    attempt.cards.some(c => c.suit === '♠' && c.rank === 3)
  ) {
    return true;
  }

  // Type and card count must match exactly
  if (attempt.type !== trickTop.type) return false;
  if (attempt.count !== trickTop.count) return false;
  
  const attemptStrength = getPlayStrength(attempt, isReversed);
  const trickStrength = getPlayStrength(trickTop, isReversed);

  return attemptStrength > trickStrength;
};

export const getAllValidPlays = (hand: CardData[], isReversed: boolean, currentTrick: Play | null, hasThreeCardRevolution: boolean = false, rules: DaifugoRules = DEFAULT_RULES): Play[] => {
  if (!hand || hand.length === 0) return [];

  const allCombinations: CardData[][] = [];
  const jokers = hand.filter(c => c.rank === 16);
  const nonJokers = hand.filter(c => c.rank !== 16);

  // 1. Singles
  hand.forEach(c => allCombinations.push([c]));

  // 2. Groups
  const rankMap = new Map<Rank, CardData[]>();
  nonJokers.forEach(c => {
    if (!rankMap.has(c.rank)) rankMap.set(c.rank, []);
    rankMap.get(c.rank)!.push(c);
  });

  rankMap.forEach((rankCards) => {
    const maxCards = Math.min(4, rankCards.length + jokers.length);
    for (let count = 2; count <= maxCards; count++) {
      for (let c = 1; c <= Math.min(count, rankCards.length); c++) {
        const jCount = count - c;
        if (jCount <= jokers.length) {
          const combo = [...rankCards.slice(0, c), ...jokers.slice(0, jCount)];
          allCombinations.push(combo);
        }
      }
    }
  });

  // Multiple Jokers group
  if (jokers.length >= 2) {
    allCombinations.push(jokers.slice(0, 2));
    if (jokers.length >= 3) allCombinations.push(jokers.slice(0, 3));
  }

  // 3. Sequences (Kaidan)
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  suits.forEach(suit => {
    const suitCards = nonJokers.filter(c => c.suit === suit).sort((a, b) => a.rank - b.rank);
    const maxLen = suitCards.length + jokers.length;
    for (let len = 3; len <= maxLen; len++) {
      for (let start = 3; start <= 15 - len + 1; start++) {
        const end = start + len - 1;
        const matchingSuitCards = suitCards.filter(c => c.rank >= start && c.rank <= end);
        let dup = false;
        for (let i = 1; i < matchingSuitCards.length; i++) {
          if (matchingSuitCards[i].rank === matchingSuitCards[i - 1].rank) {
            dup = true;
            break;
          }
        }
        if (!dup && matchingSuitCards.length + jokers.length >= len) {
          const combo = [...matchingSuitCards, ...jokers.slice(0, len - matchingSuitCards.length)];
          allCombinations.push(combo);
        }
      }
    }
  });

  const validPlays: Play[] = [];
  const playKeys = new Set<string>();

  allCombinations.forEach(combo => {
    const play = evaluatePlay(combo, isReversed, hasThreeCardRevolution, rules);
    if (play && canPlay(play, currentTrick, isReversed)) {
      const key = play.cards.map(c => c.id).sort().join(',');
      if (!playKeys.has(key)) {
        playKeys.add(key);
        validPlays.push(play);
      }
    }
  });

  return validPlays;
};

export const getAIOptimalPlay = (
  hand: CardData[],
  isReversed: boolean,
  currentTrick: Play | null,
  hasThreeCardRevolution: boolean = false,
  rules: DaifugoRules = DEFAULT_RULES
): Play | null => {
  const validPlays = getAllValidPlays(hand, isReversed, currentTrick, hasThreeCardRevolution, rules);
  if (validPlays.length === 0) return null;

  if (currentTrick === null) {
    // Leading a fresh trick: shed the largest group/sequence available first so pairs
    // and runs don't just get hoarded forever, then prefer the weakest option of that
    // size to conserve strong cards for later.
    validPlays.sort((a, b) => (b.count - a.count) || (a.strength - b.strength));
  } else {
    // Following: play the weakest card that still wins, to conserve strong cards.
    validPlays.sort((a, b) => a.strength - b.strength);
  }

  return validPlays[0];
};

export const getShopCards = (playerDeck: CardData[]): CardData[] => {
  const full = generateDeck();
  const available = full.filter(c => 
    !playerDeck.some(pc => pc.suit === c.suit && pc.rank === c.rank)
  );
  const strong = available.filter(c => c.rank >= 8);
  const shuffled = shuffleArray(strong);
  return shuffled.slice(0, 3);
};
