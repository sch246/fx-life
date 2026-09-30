// 状态条数据表。心情是主线，一开始就显示；其他条何时浮现由 data/reveals 里 id 为 `bar:<id>` 的规则决定。
// 身体模型的阈值、后果和浮现带都在 data/body.ts，这里只声明每根条的形状和初值。
// 快慢两层：快变量（体力/水分/精力）随行动即时变化；慢变量（心情/体能）分级，由快变量在一段时间里的状况推动。
// 数值是第一版初值，按试玩调。

import type { BarDef } from '../core/world';
import { EFFECTS } from './body';
import { MOOD_STYLES, START_MOOD_LV } from './mood';

/** 从 body 的后果表派生这根条的 drift，drift 只在这里出现一次。 */
const drift = (id: string) => EFFECTS.filter((e) => e.bar === id).map((e) => ({ when: e.when, perHour: e.perHour }));

export const BARS: readonly BarDef[] = [
  {
    id: 'stamina',
    name: '体力',
    // 开局刚到这座城市、还没吃饭：刚好落在 40 的第一后果带里，饿会自己浮现。
    initial: 38,
    perHour: -4,
  },
  {
    id: 'water',
    name: '水分',
    initial: 66,
    perHour: -4,
  },
  {
    id: 'energy',
    name: '精力',
    initial: 97,
    perHour: -4,
    drift: drift('energy'),
  },
  {
    id: 'mood',
    name: '心情',
    initial: 5,
    drift: drift('mood'),
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
    drift: drift('fitness'),
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
