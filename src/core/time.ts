// 时间换算。游戏时间的唯一单位是「游戏分钟」，从第 1 天 00:00 起算。

/** 现实多少毫秒推进 1 游戏分钟（现实 1 秒 = 游戏 1 分钟）。 */
export const REAL_MS_PER_GAME_MIN = 1000;
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 24 * MIN_PER_HOUR;

export const dayOf = (t: number) => Math.floor(t / MIN_PER_DAY) + 1;
export const minuteOfDay = (t: number) => ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
export const hourOf = (t: number) => Math.floor(minuteOfDay(t) / MIN_PER_HOUR);

const p2 = (n: number) => String(n).padStart(2, '0');
export const hm = (t: number) => `${p2(hourOf(t))}:${p2(minuteOfDay(t) % MIN_PER_HOUR)}`;
export const stamp = (t: number) => `第${dayOf(t)}天 ${hm(t)}`;

/** 第 day 天的 h:m 对应的游戏时间。 */
export const at = (day: number, h: number, m = 0) => (day - 1) * MIN_PER_DAY + h * MIN_PER_HOUR + m;
