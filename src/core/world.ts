// 世界推进：把各个系统按固定顺序串成「一游戏分钟」。
// 时钟每推进一分钟调用一次 stepWorld；正常速度和快进走完全相同的路径。

import type { GameState } from './state';
import type { ActionDef, CueDef, Effect, Predicate } from './rules';
import type { RevealRule } from './reveal';
import type { SkillDef } from './skills';
import { applyEffect, clampBars, level, lv, startAction, stepCues, stepOngoing, stepTasks } from './rules';
import { stepReveal } from './reveal';
import { stepRecord } from './record';
import { say } from './feed';

/** 条件成立时叠加的每小时变化。 */
export interface Drift {
  when: Predicate;
  perHour: number;
}

/**
 * 底子：条是上面那一截，底子是下面攒着的，按格算，格数就是等级。
 * - 要养：条满了还在补，多出来的攒进底子，攒够一格升一级；条本身不动。
 * - 能透支：条见底了还在耗，从底子里抽一格顶上来（硬撑），降一级；底子一直留着，只有见底时才动它。
 * - 底子也空了还在耗，就是透支到下一层：由别的条承担后果（见 data/body）。
 * state.levels 记底子有几格，带小数：整数部分是等级，小数部分是正在攒的那一格。
 */
export interface LevelDef {
  /** 开局有几格底子。 */
  start: number;
  max: number;
  /** 一格底子折合条上多少：攒一格要多出来这么多，抽一格条就回到这么多。 */
  chunk: number;
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
  const last = s.cooldowns[a.object];
  if (b && !a.auto && (last === undefined || s.t - last >= b.cooldownMin)) {
    s.cooldowns[a.object] = s.t;
    applyEffect(s, b.effect);
  }
  // 一下子补过头的（回消息时心情已经满了），多出来的也攒进底子。
  settleBars(s, c);
}

function stepLevels(s: GameState, b: BarDef): void {
  const L = b.levels;
  if (!L) return;
  const had = s.levels[b.id] ?? 0;
  const v = s.bars[b.id] ?? 0;
  if (v > 100) {
    s.levels[b.id] = Math.min(L.max, had + (v - 100) / L.chunk);
  } else if (v <= 0 && had > 0) {
    const take = Math.min(1, had);
    s.levels[b.id] = had - take;
    s.bars[b.id] = v + take * L.chunk;
  }
  const from = level(had);
  const to = lv(s, b.id);
  const line = to > from ? L.upLines?.[to] : to < from ? L.downLines?.[to] : undefined;
  if (line) say(s, line);
}

/** 这一刻所有的变化加总之后：满了的攒进底子、见底的从底子里抽，然后收回 0–100。 */
function settleBars(s: GameState, c: Content): void {
  for (const b of c.bars) stepLevels(s, b);
  clampBars(s);
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
  settleBars(s, c);
  stepCues(s, c.cues ?? []);
  settleBars(s, c);
  stepReveal(s, c.reveals);
  stepRecord(s);
}
