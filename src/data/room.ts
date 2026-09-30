// 房间的条件：光和声随时间变化。睡眠按规则读这里，不写死某一种房间。
// 第一片只有一种房间；以后住处、窗帘、天气改的是这里的输入，不是睡眠规则本身。

import { minuteOfDay } from '../core/time';

/** 从窗外进来的光，0 暗 – 1 亮。 */
export function roomLight(t: number): number {
  const h = minuteOfDay(t) / 60;
  if (h < 5.5 || h >= 19.5) return 0;
  if (h < 7) return (h - 5.5) / 1.5;
  if (h < 18) return 1;
  return 1 - (h - 18) / 1.5;
}

/** 街上的声音，0 静 – 1 吵。 */
export function roomNoise(t: number): number {
  const h = minuteOfDay(t) / 60;
  if (h >= 1 && h < 5) return 0.1;
  if (h >= 7 && h < 22) return 0.6;
  return 0.3;
}
