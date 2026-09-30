// 熟练度与自动：一件事满足了学会它的条件，就「会了」，技能栏里的按钮一点就让小人自己做完。
// - 第一次做这件事时，技能栏里出现它的按钮（显隐规则 `act:<自动动作>`）。
// - 还在学的时候，点按钮看学会它需要什么；条件可以五花八门，最常见的是亲手做成几次。
// - 会了之后，点按钮就开始对应的自动动作；手动做法一直都在。
// 具体有哪些技能、条件是什么，写在 data/skills。

import type { GameState } from './state';
import type { Predicate } from './rules';

/** 学会一件事的一个条件：现在有多少、要多少。 */
export interface SkillCondition {
  label: string;
  have: (s: GameState) => number;
  need: number;
}

export interface SkillDef {
  id: string;
  name: string;
  /** 会了之后，技能栏按钮开始的自动动作。 */
  auto: string;
  /** 第一次做这件事：技能栏里出现它的按钮。 */
  seenWhen: Predicate;
  conditions: readonly SkillCondition[];
}

export const learned = (s: GameState, k: SkillDef) => k.conditions.every((c) => c.have(s) >= c.need);

/** 学到哪儿了：所有条件完成的份数合起来，0 到 1。 */
export function skillProgress(s: GameState, k: SkillDef): { have: number; need: number } {
  let have = 0;
  let need = 0;
  for (const c of k.conditions) {
    have += Math.min(c.need, c.have(s));
    need += c.need;
  }
  return { have, need };
}
