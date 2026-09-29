// 窗外天色随时间变化：纯函数，方便单独调。

import { minuteOfDay } from '../core/time';

type RGB = [number, number, number];

// 一天中的关键时刻（分钟）与天色，中间线性插值。
const STOPS: [number, RGB][] = [
  [0, [12, 16, 34]],
  [5 * 60, [14, 18, 38]],
  [6 * 60, [120, 110, 150]],
  [7 * 60, [170, 200, 230]],
  [12 * 60, [150, 195, 235]],
  [17 * 60, [200, 170, 140]],
  [18 * 60, [120, 90, 120]],
  [19 * 60, [40, 40, 80]],
  [20 * 60, [16, 20, 44]],
  [24 * 60, [12, 16, 34]],
];

export function skyColor(t: number): string {
  const m = minuteOfDay(t);
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1][0] <= m) i++;
  const [m0, c0] = STOPS[i];
  const [m1, c1] = STOPS[i + 1];
  const k = (m - m0) / (m1 - m0);
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** 远处窗户和路灯亮着的比例：傍晚逐盏亮起，深夜渐熄，清晨全灭。 */
export function lightsOn(t: number): number {
  const m = minuteOfDay(t);
  if (m >= 18 * 60) return Math.min(1, (m - 18 * 60) / 120);
  if (m < 1 * 60) return 1;
  if (m < 6 * 60) return Math.max(0.15, 1 - (m - 60) / 240);
  if (m < 7 * 60) return 0.15 * (1 - (m - 6 * 60) / 60);
  return 0;
}
