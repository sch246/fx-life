// 状态条数据表。开局全部隐藏，何时浮现由 data/reveals 里 id 为 `bar:<id>` 的规则决定。
// 数值是初值，按试玩调整。随状态变化的速率在 data/body 里。

import type { BarDef } from '../core/world';
import { MOOD_DOWN_LINES, MOOD_UP_LINES } from './mood';

export const BARS: readonly BarDef[] = [
  // 快变量：吃东西能即时补。0 是饱，100 是饿极了。
  { id: 'hunger', name: '饥饿', initial: 40, good: 'empty' },
  // 快变量：只有睡觉能补，吃得再多也补不了。
  { id: 'energy', name: '精力', initial: 55 },
  // 有等级的条：满了升一级，空了降一级。
  {
    id: 'mood',
    name: '心情',
    initial: 10,
    levels: { count: 5, upTo: 30, downTo: 70, upLines: MOOD_UP_LINES, downLines: MOOD_DOWN_LINES },
  },
  // 慢变量：不能靠一次行动补上，只由饥饿和精力在一段时间里的状况推动；决定睡眠恢复的快慢。
  { id: 'fitness', name: '体能', initial: 50 },
];
