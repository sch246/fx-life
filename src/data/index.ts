import type { Content } from '../core/world';
import { createState, type GameState } from '../core/state';
import { stepCues } from '../core/rules';
import { revealNow } from '../core/reveal';
import { BARS } from './bars';
import { ACTIONS } from './actions';
import { REVEALS, REVEALED_AT_START } from './reveals';
import { CUES, START_ITEMS } from './cues';
import { START_WATER, WATER_PROCESS } from './water';
import { SKILLS } from './skills';
import { NOODLE_PROCESS } from './noodles';
import { DEFAULT_PERSON } from './person';

export const CONTENT: Content = {
  bars: BARS,
  actions: ACTIONS,
  reveals: REVEALS,
  cues: CUES,
  processes: [WATER_PROCESS, NOODLE_PROCESS],
  skills: SKILLS,
  // 亲手做事会让心情略微好一点；同一个物件上的事一小时内只算一次，不能靠反复点来刷。
  manualBonus: { effect: { bars: { mood: 1 } }, cooldownMin: 60 },
};

/** 首片演示到这里结束：玩家第一次出门。 */
export const DEMO_END_FLAG = 'went-out';

/** 第一代开局：条、等级、行李都从数据表来。这个人是谁，开局时由玩家挑（data/person）。 */
export function newGame(seed?: number): GameState {
  const s = createState({
    seed,
    bars: Object.fromEntries(BARS.map((b) => [b.id, b.initial])),
    levels: Object.fromEntries(BARS.filter((b) => b.levels).map((b) => [b.id, b.levels!.start])),
    items: START_ITEMS,
    things: START_WATER,
    person: DEFAULT_PERSON,
  });
  revealNow(s, REVEALED_AT_START);
  stepCues(s, CUES);
  return s;
}
