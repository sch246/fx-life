// 世界推进：把各个系统按固定顺序串成「一游戏分钟」。
// 时钟每推进一分钟调用一次 stepWorld；正常速度和快进走完全相同的路径。

import type { GameState } from './state';
import type { ActionDef, Effect, Predicate } from './rules';
import type { RevealRule } from './reveal';
import { applyEffect, blockedReason, objectAvailable, startAction, stepOngoing } from './rules';
import { isVisible, stepReveal } from './reveal';
import { stepRecord } from './record';
import { say } from './feed';

/** 条的等级：条满了升一级、空了降一级，升降后回到中间某处继续走。 */
export interface LevelDef {
  /** 等级数，0..count-1。 */
  count: number;
  /** 升级后条回到的值。 */
  upTo: number;
  /** 降级后条回到的值。 */
  downTo: number;
  /** 升到 / 降到第 i 级时写进事件流的话。 */
  upLines?: readonly string[];
  downLines?: readonly string[];
}

/** 状态条数据表的一行。 */
export interface BarDef {
  id: string;
  name: string;
  /** 什么都不做时每游戏小时的自然变化（与状态无关的部分）。 */
  perHour?: number;
  /** 开局值。 */
  initial: number;
  /** 有等级的条（例如心情）。 */
  levels?: LevelDef;
  /** 完整状态里的显示方式：fill 满为好；empty 空为好（例如饥饿）。 */
  good?: 'fill' | 'empty';
}

/**
 * 随状态变化的速率：条件成立的每一分钟，各条按 perHour/60 变化。
 * 快慢两层就靠这张表连起来：慢变量（体能、心情等级）只由快变量在一段时间里的状况推动。
 */
export interface RateRule {
  id: string;
  when?: Predicate;
  bars: Record<string, number>;
}

/** 世界里的事：条件成立时发生。once 的只发生一次。 */
export interface TriggerDef {
  id: string;
  when: Predicate;
  once?: boolean;
  effect?: Effect;
  line?: string;
  /** 让角色开始做某件事（例如累倒睡着）。 */
  start?: string;
  /** 在快进中发生时结束快进。 */
  interrupts?: boolean;
}

/** 物件（只用到 id 和首次上色时的那句话；位置等画面信息在 data/objects）。 */
export interface ObjectRef {
  id: string;
  firstLine?: string;
}

/** 一局游戏用到的全部内容表。 */
export interface Content {
  bars: readonly BarDef[];
  actions: readonly ActionDef[];
  reveals: readonly RevealRule[];
  rates?: readonly RateRule[];
  triggers?: readonly TriggerDef[];
  objects?: readonly ObjectRef[];
}

function stepLevels(s: GameState, bars: readonly BarDef[]): void {
  for (const b of bars) {
    const L = b.levels;
    if (!L) continue;
    const lv = s.levels[b.id] ?? 0;
    const v = s.bars[b.id] ?? 0;
    if (v >= 100 && lv < L.count - 1) {
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
}

/** 物件第一次上色时写一行话；开局就能用的物件不写。 */
function stepObjects(s: GameState, c: Content, silent = false): void {
  for (const o of c.objects ?? []) {
    const key = `obj:${o.id}`;
    if (s.flags[key] || !objectAvailable(s, c.actions, o.id)) continue;
    s.flags[key] = true;
    if (!silent && o.firstLine) say(s, o.firstLine);
  }
}

/** 记下当前能做的动作：之后即使因前提暂时不满足而做不了，也还留在菜单里（灰的）。 */
function stepDiscover(s: GameState, actions: readonly ActionDef[]): void {
  for (const a of actions) if (blockedReason(s, a) === null) s.reveal.seen[`act:${a.id}`] = true;
}

/** 开局：标记开局就能用的物件和动作，不写话。 */
export function initWorld(s: GameState, c: Content): void {
  stepObjects(s, c, true);
  stepDiscover(s, c.actions);
}

/** 正在做的事能不能跳过（快进）。 */
export function canSkip(s: GameState, c: Content): boolean {
  const o = s.ongoing;
  if (!o) return false;
  const a = c.actions.find((x) => x.id === o.actionId);
  return !!a?.skip && isVisible(s, a.skip);
}

/**
 * 推进一游戏分钟。返回 true 表示发生了声明为打断快进的事。
 * 浮现不打断快进。
 */
export function stepWorld(s: GameState, c: Content): boolean {
  let interrupt = false;
  s.t += 1;
  for (const b of c.bars) {
    if (b.perHour) applyEffect(s, { bars: { [b.id]: b.perHour } }, 1 / 60);
  }
  for (const r of c.rates ?? []) {
    if (!r.when || r.when(s)) applyEffect(s, { bars: r.bars }, 1 / 60);
  }
  stepOngoing(s, c.actions);
  stepLevels(s, c.bars);
  for (const tr of c.triggers ?? []) {
    const key = `ev:${tr.id}`;
    if (tr.once && s.flags[key]) continue;
    if (!tr.when(s)) continue;
    if (tr.once) s.flags[key] = true;
    if (tr.effect) applyEffect(s, tr.effect, 1, tr.id);
    if (tr.line) say(s, tr.line);
    if (tr.start) {
      const a = c.actions.find((x) => x.id === tr.start);
      if (a) startAction(s, a, c.actions);
    }
    if (tr.interrupts) interrupt = true;
  }
  stepReveal(s, c.reveals);
  stepObjects(s, c);
  stepDiscover(s, c.actions);
  stepRecord(s);
  return interrupt;
}
