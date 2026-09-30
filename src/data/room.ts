// 住处的条件。第一片只有这一间房，但睡眠等规则读的是这张表，不是写死的数。
// 以后搬家、装窗帘、换到安静的地方，改的是这里的值。

import type { GameState } from '../core/state';
import { daylight } from '../core/time';

export interface RoomDef {
  /** 窗帘遮光 0–1。0 表示没有窗帘，天亮了光会直接照进来。 */
  curtain: number;
  /** 夜里的环境噪声 0–1。 */
  noise: number;
}

export const ROOM: RoomDef = { curtain: 0, noise: 0.1 };

/** 房间里此刻的光 0–1。 */
export const roomLight = (s: GameState, r: RoomDef = ROOM) => daylight(s.t) * (1 - r.curtain);

/** 睡眠质量：光和声都会让人睡不沉。 */
export const sleepQuality = (s: GameState, r: RoomDef = ROOM) => Math.max(0.2, 1 - 0.5 * roomLight(s, r) - r.noise);

/** 躺下多久才睡着：安静、黑的房间里十分钟左右，光和声会让人更久睡不着。 */
export const FALL_ASLEEP_MIN = 10;
export const fallAsleepMin = (s: GameState, r: RoomDef = ROOM) => FALL_ASLEEP_MIN / sleepQuality(s, r);
