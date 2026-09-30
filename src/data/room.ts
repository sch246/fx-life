// 住处的条件。第一片只有这一间房，但睡眠等规则读的是这张表，不是写死的数。
// 以后搬家、装窗帘、换到安静的地方，改的是这里的值。

import type { GameState } from '../core/state';
import { daylight } from '../core/time';

export interface RoomDef {
  /** 窗帘遮光 0–1。0 表示没有窗帘，天亮了光会直接照进来。 */
  curtain: number;
  /** 夜里的环境噪声 0–1。 */
  noise: number;
  /** 屋顶那盏灯开着时屋里有多亮 0–1。亮过 0.6 就睡不着（见 data/actions 的 tooBright）。 */
  lamp: number;
}

export const ROOM: RoomDef = { curtain: 0, noise: 0.1, lamp: 0.7 };

/** 灯开着没有。开关是房间里的一个物件状态（lamp.on），开灯、关灯见 data/actions。 */
export const lampOn = (s: GameState) => !!s.things['lamp.on'];

/** 房间里此刻的光 0–1：窗外透进来的天光和灯光，取亮的那个。 */
export const roomLight = (s: GameState, r: RoomDef = ROOM) =>
  Math.max(daylight(s.t) * (1 - r.curtain), lampOn(s) ? r.lamp : 0);

/** 睡眠质量：光和声都会让人睡不沉。 */
export const sleepQuality = (s: GameState, r: RoomDef = ROOM) => Math.max(0.2, 1 - 0.5 * roomLight(s, r) - r.noise);

/** 躺下多久才睡着：安静、黑的房间里十分钟左右，光和声会让人更久睡不着。 */
export const FALL_ASLEEP_MIN = 10;
export const fallAsleepMin = (s: GameState, r: RoomDef = ROOM) => FALL_ASLEEP_MIN / sleepQuality(s, r);
