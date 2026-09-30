// 显隐规则表。id 约定：`bar:<条>`、`act:<动作>`。
// 窗户、角色、事件流、暂停和房间里的物件都是常驻元素，不在这里。
// 条的浮现不是待办：它表示此刻值得看一眼，稳定后自己淡出。

import type { RevealRule } from '../core/reveal';
import { moodLv } from '../core/rules';
import { asleep } from './body';

const v = (s: { bars: Record<string, number> }, id: string) => s.bars[id] ?? 0;

export const REVEALS: readonly RevealRule[] = [
  {
    id: 'bar:hunger',
    showWhen: (s) => v(s, 'hunger') >= 50,
    hideWhen: (s) => v(s, 'hunger') <= 20,
    holdMinutes: 20,
    firstLine: '肚子有点饿了。',
  },
  {
    // 困了会浮现；睡着时也浮现，看得见它在涨。
    id: 'bar:energy',
    showWhen: (s) => v(s, 'energy') < 35 || asleep(s),
    hideWhen: (s) => v(s, 'energy') >= 95 && !asleep(s),
    holdMinutes: 30,
  },
  {
    // 接近升级或降级时浮现，回到中段一阵子后淡出。
    id: 'bar:mood',
    showWhen: (s) => v(s, 'mood') >= 75 || (moodLv(s) > 0 && v(s, 'mood') <= 20),
    hideWhen: (s) => v(s, 'mood') > 25 && v(s, 'mood') < 70,
    holdMinutes: 90,
  },
  {
    // 睡眠跳过：心情到 lv1 时出现，掉回 lv0 时消失。每一代同一条规则。
    id: 'act:skip-sleep',
    showWhen: (s) => moodLv(s) >= 1,
    hideWhen: (s) => moodLv(s) < 1,
  },
];

/** 开局即可见的元素。 */
export const REVEALED_AT_START: readonly string[] = [];
