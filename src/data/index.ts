import type { Content } from '../core/world';
import { BARS } from './bars';
import { ACTIONS } from './actions';
import { REVEALS } from './reveals';
import { CUES } from './cues';

export const CONTENT: Content = { bars: BARS, actions: ACTIONS, reveals: REVEALS, cues: CUES };

/** 首片演示到这里结束：玩家第一次出门。 */
export const DEMO_END_FLAG = 'went-out';
