// 技能表：学会一件事要满足什么条件，会了之后技能栏按钮做什么（规则见 core/skills）。
// 第一次做这件事时按钮出现；第一片的条件都是「亲手做成几次」，以后的打工可以用别的条件。
// 泡面步骤多，要多做几次才让人信服；烧水简单，做两次就会。

import type { GameState } from '../core/state';
import { learned as learnedDef, type SkillDef } from '../core/skills';

const practice = (id: string) => (s: GameState) => s.accum[`skill:${id}`] ?? 0;

export const SKILLS: readonly SkillDef[] = [
  {
    id: 'boil',
    name: '烧水',
    auto: 'auto-boil',
    seenWhen: (s) => !!s.flags['tried:boil'],
    conditions: [{ label: '亲手烧开一壶水，趁没烧干关掉', have: practice('boil'), need: 2 }],
  },
  {
    id: 'soak',
    name: '泡面',
    auto: 'auto-noodles',
    seenWhen: (s) => !!s.flags['tried:soak'],
    conditions: [{ label: '亲手泡好一桶面再吃：料包放全、冲热水、盖好盖子，三到十分钟之间开吃', have: practice('soak'), need: 3 }],
  },
];

export const skillById = (id: string) => SKILLS.find((k) => k.id === id)!;
export const learned = (s: GameState, id: string) => learnedDef(s, skillById(id));
