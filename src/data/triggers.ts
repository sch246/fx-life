// 世界里的事：条件成立时发生（见 core/world 的 TriggerDef）。
// 事件流里的话只来自世界内部。

import type { TriggerDef } from '../core/world';
import { at } from '../core/time';
import { asleep } from './body';

export const TRIGGERS: readonly TriggerDef[] = [
  {
    id: 'msg-home-1',
    when: (s) => s.t >= at(1, 18, 35),
    once: true,
    effect: { items: { 'msg:home-1': 1 } },
    line: '手机亮了。家里：「到了吗？」',
  },
  {
    id: 'msg-home-2',
    when: (s) => s.t >= at(2, 8, 30),
    once: true,
    effect: { items: { 'msg:home-2': 1 } },
    line: '手机亮了。家里：「早饭吃了吗？」',
  },
  { id: 'tired', when: (s) => !asleep(s) && (s.bars.energy ?? 0) < 35, once: true, line: '眼皮有点沉。' },
  { id: 'noodles-low', when: (s) => (s.items.noodles ?? 0) === 1, once: true, line: '泡面快吃完了。' },
  { id: 'noodles-gone', when: (s) => (s.items.noodles ?? 0) === 0, once: true, line: '行李里的泡面吃完了。' },
  {
    id: 'collapse',
    when: (s) => !asleep(s) && (s.bars.energy ?? 0) <= 0,
    line: '实在撑不住，倒头就睡着了。',
    start: 'sleep',
  },
];

/** 开局物品。 */
export const START_ITEMS: Record<string, number> = { noodles: 3 };
export const START_LINE = '到了。房间比照片上还小。';
