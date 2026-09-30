// 身体：快慢两层，用同一条规则连起来（见 core/world 的 RateRule）。
// - 快变量随行动即时变化：饥饿（吃能补）、精力（只有睡能补）。
// - 慢变量不能靠一次行动补上：体能、心情。它们只由快变量在一段时间里的状况缓慢推动，
//   又反过来决定快变量的恢复速度（体能 → 睡眠恢复）。
// 数值是初值，按试玩调整。

import type { RateRule } from '../core/world';
import type { GameState } from '../core/state';
import { doing, moodLv } from '../core/rules';
import { roomLight, roomNoise } from './room';

export const asleep = (s: GameState) => doing(s, 'sleep');
const b = (s: GameState, id: string) => s.bars[id] ?? 0;

/** 吃饱睡足：饥饿和精力都在舒服的范围里。 */
export const cared = (s: GameState) => b(s, 'hunger') < 45 && b(s, 'energy') > 30;

/** 每级心情什么都不做时的自然走向（每小时）。lv0 会缓慢回升。 */
export const MOOD_DRIFT = [3, -0.5, -1, -2, -2];

export const RATES: readonly RateRule[] = [
  // 快变量
  { id: 'hunger-awake', when: (s) => !asleep(s), bars: { hunger: 7 } },
  { id: 'hunger-asleep', when: asleep, bars: { hunger: 3 } },
  { id: 'energy-awake', when: (s) => !asleep(s), bars: { energy: -3.5 } },

  // 心情：等级决定自然走向；身体状况推它往上或往下。
  ...MOOD_DRIFT.map((v, lv) => ({ id: `mood-drift-${lv}`, when: (s: GameState) => moodLv(s) === lv, bars: { mood: v } })),
  { id: 'mood-cared', when: cared, bars: { mood: 2 } },
  { id: 'mood-sleep', when: (s) => asleep(s) && sleepQuality(s) > 0.6, bars: { mood: 3 } },
  { id: 'mood-hungry', when: (s) => b(s, 'hunger') >= 70, bars: { mood: -5 } },
  { id: 'mood-tired', when: (s) => !asleep(s) && b(s, 'energy') < 20, bars: { mood: -4 } },

  // 体能：连续吃好睡好才慢慢上去；熬着、饿着会往下掉。
  { id: 'fitness-cared', when: cared, bars: { fitness: 0.15 } },
  { id: 'fitness-tired', when: (s) => !asleep(s) && b(s, 'energy') < 15, bars: { fitness: -1.5 } },
  { id: 'fitness-starving', when: (s) => b(s, 'hunger') >= 90, bars: { fitness: -1 } },
];

/** 睡眠质量 0–1：读房间此刻的光和声。 */
export function sleepQuality(s: GameState): number {
  return Math.max(0.2, 1 - 0.45 * roomLight(s.t) - 0.25 * roomNoise(s.t));
}

/** 睡眠恢复倍率：睡眠质量 × 体能（体能 50 时为 1）。 */
export function sleepRate(s: GameState): number {
  return sleepQuality(s) * (0.6 + 0.8 * (b(s, 'fitness') / 100));
}
