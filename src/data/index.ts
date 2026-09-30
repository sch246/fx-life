import type { Content } from '../core/world';
import { createState, type GameState } from '../core/state';
import { stepCues } from '../core/rules';
import { revealNow } from '../core/reveal';
import { BARS } from './bars';
import { ACTIONS } from './actions';
import { REVEALS, REVEALED_AT_START } from './reveals';
import { CUES, START_ITEMS } from './cues';

export const CONTENT: Content = { bars: BARS, actions: ACTIONS, reveals: REVEALS, cues: CUES };

/** 首片演示到这里结束：玩家第一次出门。 */
export const DEMO_END_FLAG = 'went-out';

/** 第一代开局：条、等级、行李都从数据表来。 */
export function newGame(seed?: number): GameState {
  const s = createState({
    seed,
    bars: Object.fromEntries(BARS.map((b) => [b.id, b.initial])),
    levels: Object.fromEntries(BARS.filter((b) => b.levels).map((b) => [b.id, b.levels!.start])),
    items: START_ITEMS,
  });
  revealNow(s, REVEALED_AT_START);
  stepCues(s, CUES);
  return s;
}
