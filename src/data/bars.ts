// 状态条数据表。开局全部隐藏，何时浮现由 data/reveals 里 id 为 `bar:<id>` 的规则决定。
// 身体模型的快慢两层（交接稿「身体模型」）：体力靠吃饭即时补，精力只有睡觉能补；
// 心情分级，是慢的一层：条满升一级，见底降一级。
// 数值是第一版初值，按试玩调。

import type { GameState } from '../core/state';
import type { BarDef } from '../core/world';
import { moodLv } from '../core/rules';

const bar = (s: GameState, id: string) => s.bars[id] ?? 0;
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
      max: 4,
      upTo: 40,
      downTo: 60,
      upLines: { 1: '好像能起来走走了。' },
      downLines: { 0: '什么都不想做了。' },
    },
  },
];
