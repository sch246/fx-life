// 世界推进：把各个系统按固定顺序串成「一游戏分钟」。
// 时钟每推进一分钟调用一次 stepWorld；正常速度和快进走完全相同的路径。

import type { GameState } from './state';
import type { ActionDef } from './rules';
import type { RevealRule } from './reveal';
import { applyEffect, stepOngoing } from './rules';
import { stepReveal } from './reveal';
import { stepRecord } from './record';

/** 状态条数据表的一行。 */
export interface BarDef {
  id: string;
  name: string;
  /** 什么都不做时每游戏小时的自然变化。 */
  perHour?: number;
  /** 开局值。 */
  initial: number;
}

/** 一局游戏用到的全部内容表。 */
export interface Content {
  bars: readonly BarDef[];
  actions: readonly ActionDef[];
  reveals: readonly RevealRule[];
}

/** 推进一游戏分钟。返回 true 表示发生了声明为打断快进的事。 */
export function stepWorld(s: GameState, c: Content): boolean {
  s.t += 1;
  for (const b of c.bars) {
    if (b.perHour) applyEffect(s, { bars: { [b.id]: b.perHour } }, 1 / 60);
  }
  stepOngoing(s, c.actions);
  const revealed = stepReveal(s, c.reveals);
  stepRecord(s);
  return revealed.some((id) => c.reveals.find((r) => r.id === id)?.interrupts === true);
}
