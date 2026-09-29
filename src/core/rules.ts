// 规则：行动语法。
// 每个行动、工作和事件都写成同一组量的变化：各根条、钱、时间，外加少量长期积累。
// 具体的行动是 data/ 里数据表的一行；这里只有解释这些行的代码。
// 不要在这里为某个行动或某一代写特判，缺什么能力就扩展语法本身。

import type { GameState } from './state';
import { say } from './feed';

/** 一组量的变化。 */
export interface Effect {
  /** 各根条的增减（0–100 刻度）。 */
  bars?: Record<string, number>;
  /** 钱的增减。非 0 时必须给出 reason，会记入账本。 */
  money?: number;
  /** 长期积累的增减：技能、回忆等。 */
  accum?: Record<string, number>;
  /** 物品数量的增减。 */
  items?: Record<string, number>;
}

/** 行动在心情低时是否被锁：需要自律的会锁，冲动的和兜底的始终开着。 */
export type Temper = 'discipline' | 'impulse' | 'always';

export type Predicate = (s: GameState) => boolean;

/** 数据表里的一行行动。 */
export interface ActionDef {
  id: string;
  /** 所属物件（房间就是菜单）。 */
  object: string;
  label: string;
  temper: Temper;
  /** 做这件事的前提。不满足时按钮不可用（是否显示由显隐规则决定）。 */
  requires?: Predicate;
  /** 开始时一次性生效。 */
  onStart?: Effect;
  /** 持续期间每游戏小时的变化，按分钟摊开结算。 */
  perHour?: Effect;
  /** 固定耗时（游戏分钟）；undefined 表示持续到被打断或手动停止。 */
  minutes?: number;
  /** 结束时一次性生效。 */
  onEnd?: Effect;
  /** 账本里的说明与分类。 */
  reason?: string;
  cat?: string;
  /** 开始时写进事件流的话。 */
  line?: string;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 把一组变化按比例 k 作用到状态上。钱的变化一律记账。 */
export function applyEffect(s: GameState, e: Effect, k = 1, reason = '', cat = 'life'): void {
  if (e.bars) for (const [id, dv] of Object.entries(e.bars)) s.bars[id] = clamp((s.bars[id] ?? 0) + dv * k, 0, 100);
  if (e.accum) for (const [id, dv] of Object.entries(e.accum)) s.accum[id] = (s.accum[id] ?? 0) + dv * k;
  if (e.items) for (const [id, dv] of Object.entries(e.items)) s.items[id] = Math.max(0, (s.items[id] ?? 0) + dv * k);
  if (e.money) {
    const amount = e.money * k;
    s.money += amount;
    s.ledger.push({ t: s.t, amount, reason: reason || '（未注明）', cat });
  }
}

/** 为什么现在不能做这件事；能做时返回 null。 */
export function blockedReason(s: GameState, a: ActionDef, lowMoodLv = 0): string | null {
  if (s.moodLv <= lowMoodLv && a.temper === 'discipline') return 'mood';
  if (a.requires && !a.requires(s)) return 'requires';
  return null;
}

export function startAction(s: GameState, a: ActionDef): void {
  if (s.ongoing) stopOngoing(s);
  if (a.onStart) applyEffect(s, a.onStart, 1, a.reason ?? a.label, a.cat);
  if (a.line) say(s, a.line);
  if (a.perHour || a.minutes) {
    s.ongoing = { actionId: a.id, start: s.t, until: a.minutes === undefined ? undefined : s.t + a.minutes };
  } else if (a.onEnd) {
    applyEffect(s, a.onEnd, 1, a.reason ?? a.label, a.cat);
  }
}

/** 推进正在进行的行动一分钟。 */
export function stepOngoing(s: GameState, actions: readonly ActionDef[]): void {
  const o = s.ongoing;
  if (!o) return;
  const a = actions.find((x) => x.id === o.actionId);
  if (!a) {
    s.ongoing = null;
    return;
  }
  if (a.perHour) applyEffect(s, a.perHour, 1 / 60, a.reason ?? a.label, a.cat);
  if (o.until !== undefined && s.t >= o.until) {
    s.ongoing = null;
    if (a.onEnd) applyEffect(s, a.onEnd, 1, a.reason ?? a.label, a.cat);
  }
}

/** 手动停止或被打断：持续期间已发生的变化保留，onEnd 不给。 */
export function stopOngoing(s: GameState): void {
  s.ongoing = null;
}
