// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作是否出现由 data/reveals 里 id 为 `act:<id>` 的规则决定。

import type { ActionDef } from '../core/rules';

export const ACTIONS: readonly ActionDef[] = [];
