// 事件流：世界内部的文字输出，也是教学通道。
// 只写世界里的话（账单、消息、身体感受……），不写作者评价（不变量 6）。

import type { GameState } from './state';

export interface FeedLine {
  t: number;
  text: string;
}

export function say(s: GameState, text: string): void {
  s.feed.push({ t: s.t, text });
}
