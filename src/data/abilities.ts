import { Ability } from '../types';

export const ALL_STANDARD_ABILITIES: Ability[] = [
  { id: 'draw_cards', name: 'ドロー', description: '戦闘中1回のみ、山札からカードを2枚引く。', type: 'active', price: 25 },
  { id: 'strong_draw', name: '豪運', description: '戦闘中1回のみ、強さ8以上のカードを2枚引く。', type: 'active', price: 30 },
  { id: 'skip_turn', name: '威圧', description: '戦闘中1回のみ、敵1体のターンを強制的にパスさせる。', type: 'active', price: 25 },
  { id: 'heal', name: 'カード補充', description: '戦闘中1回のみ、山札からカードを2枚追加で補充する。', type: 'active', price: 20 },
  { id: 'joker_draw', name: 'ジョーカー召喚', description: '戦闘中1回のみ、ジョーカーを1枚手札に加える。', type: 'active', price: 35 },
  { id: 'trick_master', name: '支配者', description: '戦闘中1回のみ、場を強制的に流し自分のターンにする。', type: 'active', price: 40 },
  { id: 'max_hp_up', name: 'スタートダッシュ', description: '初期スコアが+2ptされた状態でゲームが始まる。', type: 'passive', price: 30 },
  { id: 'gold_rush', name: 'ゴールドラッシュ', description: 'ラウンド終了時に得られるゴールドが+50される。', type: 'passive', price: 30 },
  { id: 'defense_up', name: '都落ちガード', description: '都落ちが発生した際、手札消失を防ぎ通常順位で継続する。', type: 'passive', price: 25 },
  { id: 'three_card_revolution', name: '三枚革命', description: '3枚出しでも革命が発動するようになる。', type: 'passive', price: 35 },
  { id: 'rensa', name: '連撃', description: '戦闘中1回のみ、次に出したプレイの直後、もう一度自分の番になる。', type: 'active', price: 30 },
  { id: 'kandatsu', name: '強奪', description: '戦闘中1回のみ、ランダムな敵1体から一番強いカードを1枚奪う。', type: 'active', price: 30 },
  { id: 'tefuda_senkyo', name: '手札厳選', description: '戦闘中1回のみ、手札から好きな3枚を捨てて新しく3枚引き直す。', type: 'active', price: 20 },
  { id: 'shinkakumei', name: '即革命', description: '戦闘中1回のみ、手札構成に関係なくその場で革命を発動する。', type: 'active', price: 35 },
  { id: 'teppeki', name: '鉄壁', description: '7渡しで相手に渡すカードの枚数が1枚減る（最低1枚）。', type: 'passive', price: 25 },
  { id: 'kane_no_saihai', name: '金の采配', description: 'ショップでの能力購入価格が常に2割引になる。', type: 'passive', price: 30 },
  { id: 'fukutsu', name: '不屈の精神', description: '都落ちで大貧民になった場合、そのラウンドのゴールド獲得量に+30される。', type: 'passive', price: 20 }
];

export const RARE_REVERSAL_ABILITIES: Ability[] = [
  { 
    id: 'reversal_joker_burst', 
    name: '【超絶】ジョーカー連打', 
    description: '大貧民専用奥義。戦闘中1回のみ、最強のジョーカーを3枚同時に手札に召喚する！', 
    type: 'active', 
    isRare: true, 
    price: 15 
  },
  { 
    id: 'gekurou_reversal', 
    name: '【下剋上】一括強奪流し', 
    description: '大貧民専用奥義。戦闘中1回のみ、場を即座に流して敵全員の手札からランダムに1枚ずつカードを強奪する！', 
    type: 'active', 
    isRare: true, 
    price: 15 
  },
  {
    id: 'gyakuten_emperor',
    name: '【下剋上】覇権の野望',
    description: '大貧民専用パッシブ。このラウンドで1位（大富豪）を取った場合、獲得ptが2倍（+6pt）になり一発大逆転！',
    type: 'passive',
    isRare: true,
    price: 20
  },
  {
    id: 'bourei',
    name: '【下剋上】亡霊の一手',
    description: '大貧民専用奥義。戦闘中1回のみ、現在最も手札が少ない相手の手札からランダムに2枚を強制的に捨てさせる！',
    type: 'active',
    isRare: true,
    price: 15
  },
  {
    id: 'clairvoyance',
    name: '【透視眼】千里眼',
    description: '大貧民専用パッシブ。敵の手札が常に全て見えるようになる。',
    type: 'passive',
    isRare: true,
    price: 20
  }
];
