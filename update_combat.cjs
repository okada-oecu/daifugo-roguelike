const fs = require('fs');

let code = fs.readFileSync('src/components/CombatView.tsx', 'utf8');

// gold_rush logic
code = code.replace(/gold: prev.gold \+ 50 \+ \(remainingEnemyCards \* 5\),/g, 'gold: prev.gold + 50 + (remainingEnemyCards * 5) + (gameState.abilities.some(a => a.id === "gold_rush") ? 50 : 0),');

// defense_up logic
code = code.replace(/const damage = hands.player.length \* 5;/g, 'const damage = Math.floor(hands.player.length * 5 * (gameState.abilities.some(a => a.id === "defense_up") ? 0.5 : 1));');

// Active abilities implementation in handleActiveAbility
const abilityCode = `} else if (abilityId === 'strong_draw') {
      addLog(\`【豪運】強カードを2枚引いた！\`);
      const newCards: CardData[] = [
        { id: \`sdraw_1_\${Date.now()}\`, suit: '♦', rank: Math.floor(Math.random() * 6) + 10 as Rank },
        { id: \`sdraw_2_\${Date.now()}\`, suit: '♣', rank: Math.floor(Math.random() * 6) + 10 as Rank }
      ];
      setHands(prev => ({
        ...prev,
        player: [...prev.player, ...newCards].sort((a,b) => a.rank - b.rank)
      }));
    } else if (abilityId === 'heal') {
      addLog(\`【ヒール】HPが20回復した！\`);
      setGameState(prev => ({ ...prev, playerHp: Math.min(prev.maxHp, prev.playerHp + 20) }));
    } else if (abilityId === 'joker_draw') {
      addLog(\`【ジョーカー召喚】最強のカードを手に入れた！\`);
      const newCards: CardData[] = [{ id: \`joker_\${Date.now()}\`, suit: '★', rank: 16 as Rank }];
      setHands(prev => ({
        ...prev,
        player: [...prev.player, ...newCards].sort((a,b) => a.rank - b.rank)
      }));
    } else if (abilityId === 'trick_master') {
      addLog(\`【支配者】場を強制的に流した！\`);
      setTurn('trick_end');
      setTimeout(() => {
        setTrick([]);
        setIs11Back(false);
        setPassedActors(new Set());
        setTrickOwner('player');
        setTurn('player');
      }, 1200);
    }`;

code = code.replace(/} else if \(abilityId === 'strong_draw'\) \{[\s\S]*?\}\);[\s\n]*\}/, abilityCode);

fs.writeFileSync('src/components/CombatView.tsx', code);
