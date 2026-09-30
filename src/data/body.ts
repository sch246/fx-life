// 身体模型的单一事实来源：阈值、后果、以及"值得浮现"的带。
//
// 为什么放在一张表里：同一个概念过去散在 bars.ts（drift）、reveals.ts（浮现阈值）、
// 以及各处的硬编码数字里，改一个数要翻好几处，也很难回答"这条为什么现在显示"。
// 现在规则是反过来的——先写后果，浮现点由后果边界派生：
//   - EFFECTS：条件成立时叠加的每小时变化。bars.ts 从这里派生每根条的 drift。
//   - BANDS：每根条的后果带，按阈值排列。标了 reveal 的带是"第一个真实后果"，
//     reveals.ts 据此派生 bar:* 的浮现规则；调试面板和文档也从这里读。
// 想让某根条更早出现，不要手改阈值，而是在这里给它加一条能被玩家感知的后果。
// 数值是第一版初值，按试玩调。

import { lv, type Predicate } from '../core/rules';
import type { GameState } from '../core/state';

const bar = (s: GameState, id: string) => s.bars[id] ?? 0;
/** 底子还剩多少格（带小数）。 */
const base = (s: GameState, id: string) => s.levels[id] ?? 0;

/** 阈值：一个概念只在这里定义一次。 */
export const BODY = {
  /** 吃饱睡足：体力/精力/水分都到这条线以上，才给恢复加成。三条共同的第一个后果。 */
  nourished: 40,
  /** 身体开始拖累心情的各条阈值。 */
  moodLow: { stamina: 20, water: 20, energy: 15 },
  /** 透支：还在撑的时候体能开始被扣。 */
  burnout: 10,
  /** 饿到这个程度会被饿醒。 */
  hungryWake: 15,
  /** 体能的升级/降级边界附近，慢变量只在这两端值得看。 */
  fitnessEdge: { low: 25, high: 85 },
  /** 浮现迟滞：回到这条线以上并稳定一段时间才淡出，避免在边界抖动。 */
  calm: 65,
  /**
   * 精力的底子是攒着的觉，格数满了就是睡足。精力见底时从底子里抽一格、条回到「累了」线下硬撑；
   * 睡觉把条补满后接着睡，多出来的攒回底子。见 data/bars 的 energy.levels。
   */
  rested: 3,
} as const;

/** 条件成立时叠加的每小时变化。note 给调试面板和文档看，不进入游戏。 */
export interface EffectRule {
  id: string;
  /** 影响哪根条。 */
  bar: string;
  when: Predicate;
  perHour: number;
  note: string;
}

/** 睡着了（身体被睡觉占住）；醒着包括躺着没睡着。 */
const asleep = (s: GameState) => !!s.ongoing?.occupies;
const fed = (s: GameState) =>
  bar(s, 'stamina') >= BODY.nourished && bar(s, 'energy') >= BODY.nourished && bar(s, 'water') >= BODY.nourished;

export const EFFECTS: readonly EffectRule[] = [
  // 精力：体能决定醒着时掉得多快、回得多快。睡着时不叠加，这样身体再差，睡一觉也总能往回补。
  { id: 'energy.fitness-low', bar: 'energy', when: (s) => !asleep(s) && lv(s, 'fitness') <= 1, perHour: -1, note: '体能差，醒着时精力掉得更快' },
  { id: 'energy.fitness-bottom', bar: 'energy', when: (s) => !asleep(s) && lv(s, 'fitness') === 0, perHour: -1.5, note: '体能见底，醒着时精力掉得更快' },
  { id: 'energy.fitness-high', bar: 'energy', when: (s) => lv(s, 'fitness') >= 3, perHour: 0.8, note: '体能好，精力回得快一点' },

  // 心情：心死时也会慢慢缓过来；身体照顾好回得更快，饿着累着缺水会往下掉。
  { id: 'mood.lv0', bar: 'mood', when: (s) => lv(s, 'mood') === 0, perHour: 1.7, note: '心死时心情也会慢慢缓过来' },
  { id: 'mood.nourished', bar: 'mood', when: fed, perHour: 1.5, note: '吃饱睡足，心情回升更快' },
  { id: 'mood.starving', bar: 'mood', when: (s) => bar(s, 'stamina') < BODY.moodLow.stamina, perHour: -4, note: '饿着，心情往下掉' },
  { id: 'mood.tired', bar: 'mood', when: (s) => bar(s, 'energy') < BODY.moodLow.energy, perHour: -4, note: '累垮了，心情往下掉' },
  { id: 'mood.thirsty', bar: 'mood', when: (s) => bar(s, 'water') < BODY.moodLow.water, perHour: -3, note: '缺水，心情往下掉' },

  // 体能（慢变量）：透支时快速往下掉，吃好睡好要好几天才攒回来。
  { id: 'fitness.starving', bar: 'fitness', when: (s) => bar(s, 'stamina') < BODY.burnout, perHour: -20, note: '饿空了还在撑，体能透支' },
  // 精力见底先从底子里抽一格硬撑（core/world 的底子规则）；底子也空了还在撑，才透支体能。
  { id: 'fitness.tired', bar: 'fitness', when: (s) => base(s, 'energy') <= 0 && bar(s, 'energy') < BODY.burnout, perHour: -20, note: '欠的觉把底子掏空了还在撑，体能透支' },
  { id: 'fitness.thirsty', bar: 'fitness', when: (s) => bar(s, 'water') < BODY.burnout, perHour: -20, note: '缺水还在撑，体能透支' },
  { id: 'fitness.nourished', bar: 'fitness', when: fed, perHour: 1, note: '吃好睡好，体能慢慢攒回来' },
];

/** 每根条的后果带。dir='below' 表示值跌破 at 时进入，'above' 表示值升到 at 之上。 */
export interface BandDef {
  id: string;
  bar: string;
  dir: 'below' | 'above';
  at: number;
  /** 这个带里发生什么，一句话；写不出来就不该有这个带。 */
  note: string;
  /** 这是"值得浮现"的带：第一个真实后果。 */
  reveal?: boolean;
  /** 第一次进入这个带时事件流的话（data/cues 据此派生；慢变量可以不写，让等级变化自己说话）。 */
  line?: string;
  /** 浮现后回到安全线以上/以下多久才淡出。 */
  hideAt?: number;
  holdMinutes?: number;
}

export const BANDS: readonly BandDef[] = [
  // 体力：跌破 40 就失去"吃饱睡足"的恢复加成——三条快变量共同的第一个后果，就在这里浮现。
  { id: 'stamina.hungry', bar: 'stamina', dir: 'below', at: BODY.nourished, note: '失去"吃饱睡足"的恢复加成，该吃东西了', reveal: true, line: '肚子饿了。箱子里还带着几桶面。', hideAt: BODY.calm, holdMinutes: 20 },
  { id: 'stamina.mood', bar: 'stamina', dir: 'below', at: BODY.moodLow.stamina, note: '饿着，心情开始往下掉' },
  { id: 'stamina.wake', bar: 'stamina', dir: 'below', at: BODY.hungryWake, note: '饿到这个程度会被饿醒' },
  { id: 'stamina.burnout', bar: 'stamina', dir: 'below', at: BODY.burnout, note: '饿空了还在撑，体能被透支' },

  // 水分：同样的 40 边界。
  { id: 'water.low', bar: 'water', dir: 'below', at: BODY.nourished, note: '失去恢复加成，该喝水了', reveal: true, line: '口渴了。', hideAt: BODY.calm, holdMinutes: 20 },
  { id: 'water.mood', bar: 'water', dir: 'below', at: BODY.moodLow.water, note: '缺水，心情开始往下掉' },
  { id: 'water.burnout', bar: 'water', dir: 'below', at: BODY.burnout, note: '缺水还在撑，体能被透支' },

  // 精力：只有睡觉能补，但浮现点同样由后果决定，不由"离满还差多少"决定。
  { id: 'energy.low', bar: 'energy', dir: 'below', at: BODY.nourished, note: '失去恢复加成，该休息或睡觉了', reveal: true, line: '累了。', hideAt: BODY.calm, holdMinutes: 30 },
  { id: 'energy.mood', bar: 'energy', dir: 'below', at: BODY.moodLow.energy, note: '累垮了，心情开始往下掉' },
  { id: 'energy.burnout', bar: 'energy', dir: 'below', at: BODY.burnout, note: '快见底了：再撑就掉一级；等级也到底了就透支体能' },

  // 体能（慢变量）：只在接近升级/降级边界时值得看，和快变量分开。
  { id: 'fitness.low', bar: 'fitness', dir: 'below', at: BODY.fitnessEdge.low, note: '快到降级边界了，别再透支', reveal: true, hideAt: 30, holdMinutes: 120 },
  { id: 'fitness.high', bar: 'fitness', dir: 'above', at: BODY.fitnessEdge.high, note: '快到升级边界了，保持住', reveal: true, hideAt: 80, holdMinutes: 120 },
];

/** 这个带此刻成立吗。 */
export const inBand = (s: GameState, b: BandDef): boolean =>
  b.dir === 'below' ? bar(s, b.bar) < b.at : bar(s, b.bar) >= b.at;

/** 这根条此刻处于哪些带里（按阈值由近到远）。 */
export const activeBands = (s: GameState, barId: string): BandDef[] => BANDS.filter((b) => b.bar === barId && inBand(s, b));

/** 这根条里标了 reveal 的带。 */
export const revealBands = (barId: string): BandDef[] => BANDS.filter((b) => b.bar === barId && b.reveal);

export { bar as barValue };
