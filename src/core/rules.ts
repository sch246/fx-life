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
  /** 做这件事的前提。不满足时不可用。 */
  requires?: Predicate;
  /** 前提不满足时菜单里的说明（世界内部的话，例如「没有了」）。 */
  blockedText?: string;
  /** 开始时一次性生效。 */
  onStart?: Effect;
  /** 持续期间每游戏小时的变化，按分钟摊开结算。 */
  perHour?: Effect;
  /** perHour 的倍率，按当下的状态计算（例如睡眠读房间的光和声、读体能）。 */
  rate?: (s: GameState) => number;
  /** 固定耗时（游戏分钟）；undefined 表示持续到 until 成立、被打断或手动停止。 */
  minutes?: number;
  /** 持续型行动自然结束的条件（例如睡足了就醒）。 */
  until?: Predicate;
  /** 结束时一次性生效。 */
  onEnd?: Effect;
  /**
   * 新鲜感：同一件事隔多久（游戏分钟）才恢复全部效果。
   * 距上次做不到这么久时，onStart/onEnd 里条的正向变化按比例打折。负向变化不打折。
   */
  freshMin?: number;
  /** 进行期间可以跳过（快进），由这个显隐 id 是否可见决定。 */
  skip?: string;
  /** 账本里的说明与分类。 */
  reason?: string;
  cat?: string;
  /** 开始时写进事件流的话。 */
  line?: string;
  /** 自然结束时写进事件流的话。 */
  endLine?: string;
  /** 手动停下时写进事件流的话。 */
  stopLine?: string;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 心情等级（心情是有等级的条，见 world 的 BarDef.levels）。 */
export const moodLv = (s: GameState) => s.levels.mood ?? 0;

/** 正在做某件事。 */
export const doing = (s: GameState, actionId: string) => s.ongoing?.actionId === actionId;

/** 把一组变化按比例 k 作用到状态上。钱的变化一律记账。posK 只作用于条的正向变化（新鲜感）。 */
export function applyEffect(s: GameState, e: Effect, k = 1, reason = '', cat = 'life', posK = 1): void {
  if (e.bars)
    for (const [id, dv] of Object.entries(e.bars)) {
      const d = dv * k * (dv > 0 ? posK : 1);
      s.bars[id] = clamp((s.bars[id] ?? 0) + d, 0, 100);
    }
  if (e.accum) for (const [id, dv] of Object.entries(e.accum)) s.accum[id] = (s.accum[id] ?? 0) + dv * k;
  if (e.items) for (const [id, dv] of Object.entries(e.items)) s.items[id] = Math.max(0, (s.items[id] ?? 0) + dv * k);
  if (e.money) {
    const amount = e.money * k;
    s.money += amount;
    s.ledger.push({ t: s.t, amount, reason: reason || '（未注明）', cat });
  }
}

/** 为什么现在不能做这件事；能做时返回 null。 */
export function blockedReason(s: GameState, a: ActionDef, lowMoodLv = 0): 'mood' | 'requires' | null {
  if (moodLv(s) <= lowMoodLv && a.temper === 'discipline') return 'mood';
  if (a.requires && !a.requires(s)) return 'requires';
  return null;
}

/**
 * 物件能不能用：它身上至少有一个当前不被规则挡住的行动。
 * 物件始终在房间里，不出现也不消失；能用时染上颜色，不能用时是灰的。
 * 例如门上的「出门」需要自律，心情最低时被挡住，门就是灰的。这不是门的特例，是同一条规则。
 */
export function objectAvailable(s: GameState, actions: readonly ActionDef[], objectId: string, lowMoodLv = 0): boolean {
  return actions.some((a) => a.object === objectId && blockedReason(s, a, lowMoodLv) === null);
}

/** 新鲜感系数：0–1。 */
export function freshness(s: GameState, a: ActionDef): number {
  if (!a.freshMin) return 1;
  const last = s.lastDone[a.id];
  if (last === undefined) return 1;
  return clamp((s.t - last) / a.freshMin, 0, 1);
}

function finish(s: GameState, a: ActionDef, posK: number): void {
  if (a.onEnd) applyEffect(s, a.onEnd, 1, a.reason ?? a.label, a.cat, posK);
  s.lastDone[a.id] = s.t;
}

export function startAction(s: GameState, a: ActionDef, actions: readonly ActionDef[]): void {
  if (s.ongoing) stopOngoing(s, actions);
  const posK = freshness(s, a);
  if (a.onStart) applyEffect(s, a.onStart, 1, a.reason ?? a.label, a.cat, posK);
  if (a.line) say(s, a.line);
  if (a.perHour || a.minutes || a.until) {
    s.ongoing = { actionId: a.id, start: s.t, until: a.minutes === undefined ? undefined : s.t + a.minutes, posK };
  } else {
    finish(s, a, posK);
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
  if (a.perHour) applyEffect(s, a.perHour, (a.rate ? a.rate(s) : 1) / 60, a.reason ?? a.label, a.cat);
  if ((o.until !== undefined && s.t >= o.until) || (a.until && a.until(s))) {
    s.ongoing = null;
    finish(s, a, o.posK ?? 1);
    if (a.endLine) say(s, a.endLine);
  }
}

/** 手动停止或被打断：持续期间已发生的变化保留，onEnd 不给。 */
export function stopOngoing(s: GameState, actions: readonly ActionDef[] = []): void {
  const o = s.ongoing;
  if (!o) return;
  s.ongoing = null;
  const a = actions.find((x) => x.id === o.actionId);
  if (a) {
    s.lastDone[a.id] = s.t;
    if (a.stopLine) say(s, a.stopLine);
  }
}
