// 世界里自己发生的事：条件第一次成立时写一行、生效一次。
import type { CueDef } from '../core/rules';
import { at } from '../core/time';
import { MESSAGES } from './messages';
import { SKILLS } from './skills';
import { learned } from '../core/skills';

export const CUES: readonly CueDef[] = [
  { id: 'arrive', when: () => true, line: '到了。房间比照片上还小。' },
  { id: 'dusk', when: (s) => s.t >= at(1, 19, 10), line: '对面楼里的灯一盏盏亮起来。' },
  ...MESSAGES.map((m): CueDef => ({ id: `msg-${m.id}`, when: (s) => s.t >= m.at, effect: { flags: [`msg:${m.id}`] }, line: '手机震了一下。' })),
  { id: 'noodles-low', when: (s) => (s.items.noodles ?? 0) <= 1, line: '箱子里的面快吃完了。' },
  ...SKILLS.map((k): CueDef => ({ id: `learn-${k.id}`, when: (s) => learned(s, k), line: `${k.name}这件事，算是会了。` })),
];

/** 开局时行李箱里的东西。 */
export const START_ITEMS: Record<string, number> = { noodles: 6 };
