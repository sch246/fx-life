// 熟练度：手动做成功几次，就会了，出现「自动」。
// 门槛写在这里，不写在动作里。第一片的门槛很低，给以后更复杂的打工留出同一条路。

import type { GameState } from '../core/state';

export const SKILLS = {
  boil: { name: '烧水', need: 1 },
  soak: { name: '泡面', need: 2 },
} as const;

export type SkillId = keyof typeof SKILLS;

export const skill = (s: GameState, id: SkillId) => s.accum[`skill:${id}`] ?? 0;
export const learned = (s: GameState, id: SkillId) => skill(s, id) >= SKILLS[id].need;
