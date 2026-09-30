// 状态条数据表。开局全部隐藏，何时浮现由 data/reveals 里 id 为 `bar:<id>` 的规则决定。
// 身体模型的快慢两层（交接稿「身体模型」），全部用同一条规则写：
// - 快变量：体力靠吃饭即时补，精力只有睡觉能补。
// - 慢变量：心情和体能分级。条满升一级、见底降一级；
//   体能只被快变量在一段时间里的状况推动：透支时很快往下掉，吃好睡好要好几天才攒满一级。
// 数值是第一版初值，按试玩调。

import type { GameState } from '../core/state';
import type { BarDef } from '../core/world';
import { moodLv } from '../core/rules';
import { MOOD_STYLES, START_MOOD_LV } from './mood';

const bar = (s: GameState, id: string) => s.bars[id] ?? 0;
const lv = (s: GameState, id: string) => s.levels[id] ?? 0;
const fedAndRested = (s: GameState) => bar(s, 'stamina') >= 40 && bar(s, 'energy') >= 40;

export const BARS: readonly BarDef[] = [
  {
    id: 'stamina',
    name: '体力',
    initial: 62,
    perHour: -4,
  },
  {
    id: 'energy',
    name: '精力',
    initial: 97,
    perHour: -4,
    drift: [
      // 体能决定精力掉得多快。
      { when: (s) => lv(s, 'fitness') <= 1, perHour: -1 },
      { when: (s) => lv(s, 'fitness') === 0, perHour: -1.5 },
      { when: (s) => lv(s, 'fitness') >= 3, perHour: 0.8 },
    ],
  },
  {
    id: 'mood',
    name: '心情',
    initial: 5,
    drift: [
      // 在 lv0，什么都不做心情也会缓慢回升。lv1 以上暂不自然变化（唯一稳定点放在哪一级待定）。
      { when: (s) => moodLv(s) === 0, perHour: 2 },
      // 吃饱睡足回升得更快；饿着或累垮会往下掉。
      { when: fedAndRested, perHour: 1.5 },
      { when: (s) => bar(s, 'stamina') < 20, perHour: -4 },
      { when: (s) => bar(s, 'energy') < 15, perHour: -4 },
    ],
    levels: {
      start: START_MOOD_LV,
      max: 4,
      upTo: 40,
      downTo: 60,
      upLines: { 1: '好像能起来走走了。' },
      downLines: { 0: '什么都不想做了。' },
      styles: MOOD_STYLES,
    },
  },
  {
    id: 'fitness',
    name: '体能',
    initial: 50,
    drift: [
      // 透支：饿空了或累垮了还在撑。
      { when: (s) => bar(s, 'stamina') < 10, perHour: -20 },
      { when: (s) => bar(s, 'energy') < 10, perHour: -20 },
      // 吃好睡好，慢慢攒回来：从见底到满要四五天。
      { when: fedAndRested, perHour: 1 },
    ],
    levels: {
      start: 2,
      max: 4,
      upTo: 30,
      downTo: 70,
      upLines: { 3: '身体好像结实了一点。', 4: '身体好像结实了一点。' },
      downLines: { 1: '身体有点撑不住了。', 0: '身体垮下来了。' },
      styles: [
        { thickness: 2, color: '#8a6f6a' },
        { thickness: 4, color: '#9b8a78' },
        { thickness: 6, color: '#a3a08c' },
        { thickness: 8, color: '#9fb08e' },
        { thickness: 10, color: '#8fbf8a' },
      ],
    },
  },
];
