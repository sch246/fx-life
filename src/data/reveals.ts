// 显隐规则表。id 约定：`bar:<条>`、`act:<动作>`。
// 窗户、角色、事件流、暂停和房间里的物件都是常驻元素，不在这里。
// 没有显隐规则的动作一直在菜单里（能不能做由行动规则决定）。

import type { RevealRule } from '../core/reveal';
import { moodLv } from '../core/rules';
import { SKILLS } from './skills';

export const REVEALS: readonly RevealRule[] = [
  {
    id: 'bar:energy',
    showWhen: (s) => s.bars.energy < 90,
    hideWhen: (s) => s.bars.energy >= 95,
    holdMinutes: 30,
    firstLine: '有点累了。',
  },
  {
    id: 'bar:stamina',
    showWhen: (s) => s.bars.stamina < 50,
    hideWhen: (s) => s.bars.stamina >= 80,
    holdMinutes: 20,
    firstLine: '肚子饿了。箱子里还带着几桶面。',
  },
  {
    id: 'bar:water',
    showWhen: (s) => s.bars.water < 45,
    hideWhen: (s) => s.bars.water >= 80,
    holdMinutes: 20,
    firstLine: '口渴了。',
  },
  {
    // 体能不会一直显示：透支或攒满、接近变级时浮现。
    id: 'bar:fitness',
    showWhen: (s) => s.bars.fitness <= 25 || s.bars.fitness >= 85,
    hideWhen: (s) => s.bars.fitness > 30 && s.bars.fitness < 80,
    holdMinutes: 120,
  },
  // 技能栏：第一次做这件事时出现它的按钮，之后一直留着（学会之前点它看要怎样才算会）。
  ...SKILLS.map((k): RevealRule => ({ id: `act:${k.auto}`, showWhen: k.seenWhen })),
  // 升到 lv1 后浮现的新动作。发现后一直留着。
  { id: 'act:unpack', showWhen: (s) => moodLv(s) >= 1 },
  // 睡眠跳过依赖可失去的条件：掉回 lv0 就消失。
  { id: 'act:sleep-skip', showWhen: (s) => moodLv(s) >= 1, hideWhen: (s) => moodLv(s) < 1 },
];

/** 开局即可见的元素。心情是主线，一开始就在，一直显示。 */
export const REVEALED_AT_START: readonly string[] = ['bar:mood'];
