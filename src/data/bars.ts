// 状态条数据表。开局全部隐藏，何时浮现由 data/reveals 里 id 为 `bar:<id>` 的规则决定。
// 第一片会在这里加入饥饿、精力、心情。数值初值可参考 reference/ 原型，再按试玩调整。

import type { BarDef } from '../core/world';

export const BARS: readonly BarDef[] = [];
