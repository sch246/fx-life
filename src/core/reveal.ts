// 显隐：所有界面元素（条、物件、动作）共用的一条规则。
// - 每个元素有出现条件和消失条件，中间留迟滞：消失条件要连续成立 holdMinutes 才真正消失。
// - 没有消失条件的元素（已发现的能力）一直留着；依赖可失去条件（心情等级、熟练度、
//   平台等级）的能力，把那个条件写进 hideWhen 即可，不是特例。
// - 一次只浮现一个新元素：待浮现的元素排队，两次浮现之间至少隔 REVEAL_GAP_MIN。
// - 元素第一次浮现时往事件流写一行，这行话就是教学。之后再浮现不重复。
// 淡入淡出由场景层根据 visible 的变化做 CSS 过渡，这里只管逻辑。

import type { GameState } from './state';
import { say } from './feed';

export interface RevealRule {
  id: string;
  showWhen: (s: GameState) => boolean;
  /** 省略表示一旦出现就一直留着。 */
  hideWhen?: (s: GameState) => boolean;
  /** 消失条件需要连续成立的游戏分钟数（迟滞）。 */
  holdMinutes?: number;
  /** 第一次浮现时写进事件流的话。 */
  firstLine?: string;
}

export interface RevealState {
  visible: Record<string, true>;
  /** 曾经浮现过（决定是否还写首次那行话）。 */
  seen: Record<string, true>;
  /** 等待浮现的元素，先到先出。 */
  queue: string[];
  /** 消失条件从何时开始连续成立。 */
  hideSince: Record<string, number>;
  lastRevealT: number;
}

/** 两次浮现之间的最小间隔（游戏分钟）。 */
export const REVEAL_GAP_MIN = 5;

export const isVisible = (s: GameState, id: string) => !!s.reveal.visible[id];

/** 每游戏分钟调用一次。返回本分钟新浮现的元素 id（没有则为 null）。 */
export function stepReveal(s: GameState, rules: readonly RevealRule[]): string | null {
  const r = s.reveal;
  const byId = new Map(rules.map((x) => [x.id, x]));

  for (const rule of rules) {
    const id = rule.id;
    if (r.visible[id]) {
      if (rule.hideWhen && rule.hideWhen(s)) {
        r.hideSince[id] ??= s.t;
        if (s.t - r.hideSince[id] >= (rule.holdMinutes ?? 0)) {
          delete r.visible[id];
          delete r.hideSince[id];
        }
      } else {
        delete r.hideSince[id];
      }
    } else if (!r.queue.includes(id) && rule.showWhen(s)) {
      r.queue.push(id);
    }
  }

  // 条件已经不成立的排队项直接丢掉，不让过时的东西冒出来。
  r.queue = r.queue.filter((id) => byId.get(id)?.showWhen(s));

  if (r.queue.length === 0 || s.t - r.lastRevealT < REVEAL_GAP_MIN) return null;
  const id = r.queue.shift()!;
  r.visible[id] = true;
  r.lastRevealT = s.t;
  if (!r.seen[id]) {
    r.seen[id] = true;
    const line = byId.get(id)?.firstLine;
    if (line) say(s, line);
  }
  return id;
}

/** 开局即有的元素：直接可见，不占浮现队列，也不写话。 */
export function revealNow(s: GameState, ids: readonly string[]): void {
  for (const id of ids) {
    s.reveal.visible[id] = true;
    s.reveal.seen[id] = true;
  }
}
