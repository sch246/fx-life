// 显隐：状态条等会淡入淡出的界面元素共用的一条规则。
// - 每个元素有出现条件和消失条件，中间留迟滞：消失条件要连续成立 holdMinutes 才真正消失。
// - 没有消失条件的元素一直留着。
// - 元素第一次浮现时往事件流写一行。之后再浮现不重复。
// - 没有焦点队列，也不因浮现暂停或打断快进：注意力由世界自然运转产生
//   （窗外变化、事件流、条随身体变化浮现），不由人为编排顺序。
// - 房间里的物件不走这里：物件始终在场，能不能用由行动规则决定（见 core/rules 的 objectAvailable）。
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
  /** 消失条件从何时开始连续成立。 */
  hideSince: Record<string, number>;
}

export const isVisible = (s: GameState, id: string) => !!s.reveal.visible[id];

/** 每游戏分钟调用一次。 */
export function stepReveal(s: GameState, rules: readonly RevealRule[]): void {
  const r = s.reveal;
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
    } else if (rule.showWhen(s)) {
      r.visible[id] = true;
      if (!r.seen[id]) {
        r.seen[id] = true;
        if (rule.firstLine) say(s, rule.firstLine);
      }
    }
  }
}

/** 开局即可见的元素：直接可见，不写话。 */
export function revealNow(s: GameState, ids: readonly string[]): void {
  for (const id of ids) {
    s.reveal.visible[id] = true;
    s.reveal.seen[id] = true;
  }
}
