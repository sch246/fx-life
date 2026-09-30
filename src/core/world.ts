// 世界推进：把各个系统按固定顺序串成「一游戏分钟」。
// 时钟每推进一分钟调用一次 stepWorld；正常速度和快进走完全相同的路径。

import type { GameState } from './state';
import type { ActionDef, CueDef, Effect, Predicate } from './rules';
import type { RevealRule } from './reveal';
import type { SkillDef } from './skills';
import { applyEffect, startAction, stepCues, stepOngoing, stepTasks } from './rules';
import { stepReveal } from './reveal';
import { stepRecord } from './record';
import { say } from './feed';

/** 条件成立时叠加的每小时变化。 */
export interface Drift {
  when: Predicate;
  perHour: number;
}

/**
 * 分级：条的当前值快速变化，等级是慢的一层。
 * 条满时升一级、见底时降一级，然后从 upTo / downTo 重新开始，中间留出余地，不会来回跳。
 */
export interface LevelDef {
  /** 开局等级。 */
  start: number;
  max: number;
  upTo: number;
  downTo: number;
  /** 到达某一级时写进事件流的话（键是到达的等级）。 */
  upLines?: Record<number, string>;
  downLines?: Record<number, string>;
  /** 各级条的粗细（px）与颜色：玩家靠这个发现条有等级，不写成文字标签。 */
  styles?: readonly { thickness: number; color: string }[];
}

/** 状态条数据表的一行。 */
export interface BarDef {
  id: string;
  name: string;
  /** 什么都不做时每游戏小时的自然变化。 */
  perHour?: number;
  /** 条件成立时额外叠加的变化（例如吃饱睡足时心情回升得更快）。 */
  drift?: readonly Drift[];
  levels?: LevelDef;
  /** 开局值。 */
  initial: number;
}

/**
 * 物件自己的物理过程：水壶加热、水慢慢变凉、烧干。
 * 它们和小人在做什么无关，每游戏分钟照常推进，只读写 state.things 和事件流。
 */
export interface ProcessDef {
  id: string;
  step: (s: GameState) => void;
}

/**
 * 亲手做事的一点满足感：非自动的行动开始时生效。
 * 同一个物件上的事隔一段时间才再给一次：泡一桶面要好几步，也只算一次，不能靠反复点来刷。
 */
export interface ManualBonus {
  effect: Effect;
  cooldownMin: number;
}

/** 一局游戏用到的全部内容表。 */
export interface Content {
  bars: readonly BarDef[];
  actions: readonly ActionDef[];
  reveals: readonly RevealRule[];
  cues?: readonly CueDef[];
  processes?: readonly ProcessDef[];
  manualBonus?: ManualBonus;
  /** 心情太低、做不了需要自律的事时，小人说的那句话（见 core/rules 的 whyNot）。 */
  moodWhy?: (a: ActionDef) => string;
  skills?: readonly SkillDef[];
}

/** 玩家发起一件事：开始它，手动做的再给一点心情。 */
export function perform(s: GameState, c: Content, a: ActionDef): void {
  startAction(s, a);
  const b = c.manualBonus;
  if (!b || a.auto) return;
  const last = s.cooldowns[a.object];
  if (last !== undefined && s.t - last < b.cooldownMin) return;
  s.cooldowns[a.object] = s.t;
  applyEffect(s, b.effect);
}

function stepLevels(s: GameState, b: BarDef): void {
  const L = b.levels;
  if (!L) return;
  const lv = s.levels[b.id] ?? 0;
  const v = s.bars[b.id] ?? 0;
  if (v >= 100 && lv < L.max) {
    s.levels[b.id] = lv + 1;
    s.bars[b.id] = L.upTo;
    const line = L.upLines?.[lv + 1];
    if (line) say(s, line);
  } else if (v <= 0 && lv > 0) {
    s.levels[b.id] = lv - 1;
    s.bars[b.id] = L.downTo;
    const line = L.downLines?.[lv - 1];
    if (line) say(s, line);
  }
}

/** 推进一游戏分钟。浮现不打断快进；将来需要打断的事件由事件规则声明。 */
export function stepWorld(s: GameState, c: Content): void {
  s.t += 1;
  // 先按这一分钟开始时的状态算出所有条的变化，再一起生效，避免条与条之间的先后顺序影响结果。
  const delta: Record<string, number> = {};
  for (const b of c.bars) {
    let dv = b.perHour ?? 0;
    for (const d of b.drift ?? []) if (d.when(s)) dv += d.perHour;
    if (dv) delta[b.id] = dv;
  }
  applyEffect(s, { bars: delta }, 1 / 60);
  for (const p of c.processes ?? []) p.step(s);
  stepOngoing(s, c.actions);
  stepTasks(s, c.actions);
  for (const b of c.bars) stepLevels(s, b);
  stepCues(s, c.cues ?? []);
  stepReveal(s, c.reveals);
  stepRecord(s);
}
