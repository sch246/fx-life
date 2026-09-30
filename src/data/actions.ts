// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作能不能做由 temper、requires 等规则决定；所属物件据此上色或变灰。

import type { ActionDef } from '../core/rules';

export const ACTIONS: readonly ActionDef[] = [];
