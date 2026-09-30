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
  /** 记下发生过的事。 */
  flags?: readonly string[];
  /** 物件状态的增减，键是「物件.属性」（例如 kettle.water）。 */
  things?: Record<string, number>;
  /** 物件状态直接设成某个值（例如开关、泡上面的时刻）。 */
  set?: Record<string, number>;
}

/** 效果可以是固定的一组变化，也可以按当下的状态算出来（例如接水后的水温、面泡了多久）。 */
export type EffectLike = Effect | ((s: GameState) => Effect);
export const resolve = (s: GameState, e: EffectLike | undefined): Effect | undefined => (typeof e === 'function' ? e(s) : e);

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
  /** 开始时一次性生效。 */
  onStart?: EffectLike;
  /** 持续期间每游戏小时的变化，按分钟摊开结算。 */
  perHour?: Effect;
  /** 持续变化的倍率，读当下的条件（例如房间的光和声影响睡眠）。省略为 1。 */
  rate?: (s: GameState) => number;
  /** 固定耗时（游戏分钟）；undefined 表示持续到条件成立、被打断或手动停止。 */
  minutes?: number;
  /** 持续型行动自然结束的条件（例如睡足且天亮）。 */
  stopWhen?: Predicate;
  /** 结束时一次性生效（固定耗时做完，或 stopWhen 成立）。 */
  onEnd?: EffectLike;
  /** 账本里的说明与分类。 */
  reason?: string;
  cat?: string;
  /** 开始时写进事件流的话。 */
  line?: string | ((s: GameState) => string);
  /** 自然结束时写进事件流的话（按结束前的状态算）。 */
  endLine?: string | ((s: GameState) => string);
  /** 手动停止时菜单里显示的字。 */
  stopLabel?: string;
  /** 跳过：开始后快进，直到这件事结束。 */
  skip?: boolean;
  /** 角色在做这件事时的姿势，场景据此绘制。可以随状态变（例如躺着还没睡着）。 */
  pose?: string | ((s: GameState) => string);
  /**
   * 身体被这件事占住（例如睡着）：这时别的事都做不了，只能先停下它。
   * 可以随时间变：since 是这件事开始后过了多少分钟（例如躺下一会儿才睡着）。
   */
  occupies?: boolean | ((s: GameState, since: number) => boolean);
  /**
   * 只用手、原地就能做（例如看手机回消息）：不起身，不打断正在做的事。
   * 这样的动作必须是一下就做完的（没有耗时）；身体被占住时照样做不了。
   */
  hands?: boolean;
  /** 自动：小人自己把这件事做完，玩家不用盯着。手动做熟之后出现在技能栏里，不在物件的菜单里。 */
  auto?: boolean;
  /**
   * 在后台进行：开个头（例如接水、打开开关）就不用守着，小人可以去做别的事，别的事也不会把它打断；
   * stopWhen 成立时小人顺手收尾（onEnd，例如关掉开关）。身体被占住（睡着）时收不了尾，要等醒来。
   * 开头那一下和别的事一样要走过去，会停下手上正在做的事。
   */
  background?: boolean;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 把一组变化按比例 k 作用到状态上。钱的变化一律记账。 */
export function applyEffect(s: GameState, e: Effect, k = 1, reason = '', cat = 'life'): void {
  if (e.bars) for (const [id, dv] of Object.entries(e.bars)) s.bars[id] = clamp((s.bars[id] ?? 0) + dv * k, 0, 100);
  if (e.accum) for (const [id, dv] of Object.entries(e.accum)) s.accum[id] = (s.accum[id] ?? 0) + dv * k;
  if (e.items) for (const [id, dv] of Object.entries(e.items)) s.items[id] = Math.max(0, (s.items[id] ?? 0) + dv * k);
  if (e.flags) for (const f of e.flags) s.flags[f] = true;
  if (e.things) for (const [id, dv] of Object.entries(e.things)) s.things[id] = Math.max(0, (s.things[id] ?? 0) + dv * k);
  if (e.set) for (const [id, v] of Object.entries(e.set)) s.things[id] = v;
  if (e.money) {
    const amount = e.money * k;
    s.money += amount;
    s.ledger.push({ t: s.t, amount, reason: reason || '（未注明）', cat });
  }
}

/** 心情等级。需要自律的行动在心情最低时被挡住。 */
export const moodLv = (s: GameState) => s.levels.mood ?? 0;

/** 为什么现在不能做这件事；能做时返回 null。 */
export function blockedReason(s: GameState, a: ActionDef, lowMoodLv = 0): string | null {
  if (s.ongoing?.occupies && s.ongoing.actionId !== a.id) return 'busy';
  if (a.background && s.tasks.some((t) => t.actionId === a.id)) return 'running';
  if (moodLv(s) <= lowMoodLv && a.temper === 'discipline') return 'mood';
  if (a.requires && !a.requires(s)) return 'requires';
  return null;
}

/**
 * 物件能不能用：它身上至少有一个当前不被规则挡住的行动，或者正在做的事就在它身上（可以停下）。
 * 可以随时打开来看的物件（peek：行李箱、水壶、手机）只要身体没被占住就能用。
 * 物件始终在房间里，不出现也不消失；能用时染上颜色，不能用时是灰的。
 * 例如门上的「出门」需要自律，心情最低时被挡住，门就是灰的；睡着时除了床，别的都是灰的。
 * 这些都不是特例，是同一条规则。自动的动作不算：它们在技能栏里。
 */
export function objectAvailable(
  s: GameState,
  actions: readonly ActionDef[],
  objectId: string,
  peek = false,
  lowMoodLv = 0,
): boolean {
  const cur = s.ongoing && actions.find((a) => a.id === s.ongoing!.actionId);
  if (cur && cur.object === objectId) return true;
  if (peek && !s.ongoing?.occupies) return true;
  return actions.some((a) => a.object === objectId && !a.auto && blockedReason(s, a, lowMoodLv) === null);
}

const isOngoing = (a: ActionDef) => !!(a.perHour || a.minutes || a.stopWhen);
const text = (s: GameState, t: ActionDef['line']) => (typeof t === 'function' ? t(s) : t);
const occupiesAt = (s: GameState, a: ActionDef, since: number) =>
  typeof a.occupies === 'function' ? a.occupies(s, since) : !!a.occupies;

/** 角色此刻的姿势：正在做的事决定。 */
export function poseOf(s: GameState, actions: readonly ActionDef[]): string {
  const a = s.ongoing && actions.find((x) => x.id === s.ongoing!.actionId);
  return (a && text(s, a.pose)) ?? '';
}

/** 原地用手做、一下就完的事，不打断正在做的事。 */
export const keepsCurrent = (a: ActionDef) => !!a.hands && !isOngoing(a);

export function startAction(s: GameState, a: ActionDef): void {
  if (s.ongoing && !keepsCurrent(a)) stopOngoing(s);
  // 先按开始前的状态定下这句话（例如面泡了多久），再生效。
  const line = text(s, a.line);
  const start = resolve(s, a.onStart);
  if (start) applyEffect(s, start, 1, a.reason ?? a.label, a.cat);
  if (line) say(s, line);
  if (a.background) {
    s.tasks.push({ actionId: a.id, start: s.t });
  } else if (isOngoing(a)) {
    s.ongoing = { actionId: a.id, start: s.t, until: a.minutes === undefined ? undefined : s.t + a.minutes };
    if (occupiesAt(s, a, 0)) s.ongoing.occupies = true;
  } else {
    const end = resolve(s, a.onEnd);
    if (end) applyEffect(s, end, 1, a.reason ?? a.label, a.cat);
  }
}

function finish(s: GameState, a: ActionDef, foreground = true): void {
  // 先按结束前的状态定下这句话（例如睡着了没有），再结束。
  const line = text(s, a.endLine);
  if (foreground) s.ongoing = null;
  const end = resolve(s, a.onEnd);
  if (end) applyEffect(s, end, 1, a.reason ?? a.label, a.cat);
  if (line) say(s, line);
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
  if (occupiesAt(s, a, s.t - o.start)) o.occupies = true;
  else delete o.occupies;
  if ((o.until !== undefined && s.t >= o.until) || (a.stopWhen && a.stopWhen(s))) finish(s, a);
}

/** 手动停止或被打断：持续期间已发生的变化保留，onEnd 不给。 */
export function stopOngoing(s: GameState): void {
  s.ongoing = null;
}

/** 推进后台的事一分钟：条件成立、身体又空着，就顺手收尾。 */
export function stepTasks(s: GameState, actions: readonly ActionDef[]): void {
  if (s.ongoing?.occupies) return;
  for (const task of [...s.tasks]) {
    const a = actions.find((x) => x.id === task.actionId);
    if (a?.stopWhen && !a.stopWhen(s)) continue;
    s.tasks = s.tasks.filter((t) => t !== task);
    if (a) finish(s, a, false);
  }
}

/** 提前结束后台的这件事：现在就收尾（例如水还没开就关掉开关）。 */
export function stopTask(s: GameState, actions: readonly ActionDef[], actionId: string): void {
  const a = actions.find((x) => x.id === actionId);
  if (!s.tasks.some((t) => t.actionId === actionId)) return;
  s.tasks = s.tasks.filter((t) => t.actionId !== actionId);
  if (a) finish(s, a, false);
}

/** 这件事正在做：前台或者后台。 */
export const running = (s: GameState, actionId: string) =>
  s.ongoing?.actionId === actionId || s.tasks.some((t) => t.actionId === actionId);

/** 世界里自己发生的事：条件第一次成立时生效一次（来消息、天黑、东西快用完）。 */
export interface CueDef {
  id: string;
  when: Predicate;
  effect?: Effect;
  line?: string;
}

export function stepCues(s: GameState, cues: readonly CueDef[]): void {
  for (const c of cues) {
    const key = `cue:${c.id}`;
    if (s.flags[key] || !c.when(s)) continue;
    s.flags[key] = true;
    if (c.effect) applyEffect(s, c.effect);
    if (c.line) say(s, c.line);
  }
}

/** 点物件时的菜单项：开始某个行动，或停下正在做的事。 */
export interface MenuEntry {
  kind: 'start' | 'stop';
  action: ActionDef;
}

/**
 * 某个物件此刻的菜单：只列出现在就能做的事。
 * 有显隐规则的动作只在浮现后列出（visible 判断）；被规则挡住的不列，物件本身按规则变灰或上色。
 * 自动的动作在技能栏里，不在物件的菜单里。
 */
export function objectMenu(
  s: GameState,
  actions: readonly ActionDef[],
  objectId: string,
  visible: (actionId: string) => boolean,
): MenuEntry[] {
  const out: MenuEntry[] = [];
  const cur = s.ongoing && actions.find((a) => a.id === s.ongoing!.actionId);
  if (cur && cur.object === objectId && cur.stopLabel) out.push({ kind: 'stop', action: cur });
  for (const a of actions) {
    if (a.object !== objectId || a.auto || !visible(a.id) || (cur && cur.id === a.id)) continue;
    if (blockedReason(s, a) === null) out.push({ kind: 'start', action: a });
  }
  return out;
}

/**
 * 行动会影响哪些条、往哪个方向：预览用，隐藏的条也列出。
 * 按当下的状态算（例如饮水机里的水没烧开过，喝下去体能会降），行动前就能看到确定的代价。
 */
export function barPreview(s: GameState, a: ActionDef): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const e of [a.onStart, a.perHour, a.onEnd]) {
    for (const [id, dv] of Object.entries(resolve(s, e)?.bars ?? {})) if (dv) out[id] = dv > 0 ? 1 : -1;
  }
  return out;
}
