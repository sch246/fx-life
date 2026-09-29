// 显隐规则表。id 约定：`bar:<条>`、`obj:<物件>`、`act:<动作>`。
// 窗户、角色、事件流、暂停是常驻元素，不在这里。

import type { RevealRule } from '../core/reveal';

export const REVEALS: readonly RevealRule[] = [];

/** 开局即可见、不走浮现队列的元素。 */
export const REVEALED_AT_START: readonly string[] = [];
