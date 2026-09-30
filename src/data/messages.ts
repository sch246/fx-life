// 手机里的消息。每条消息在某个时刻到达，在手机的聊天界面里回复，回复后心情上升一点。
// 到达和回复都由这张表生成（cues 和 actions），不单独写代码。

import { at } from '../core/time';

export interface MessageDef {
  id: string;
  at: number;
  from: string;
  text: string;
  reply: string;
  mood: number;
}

export const MESSAGES: readonly MessageDef[] = [
  { id: 'arrived', at: at(1, 19, 30), from: '家里', text: '到了吗？', reply: '到了，都好。', mood: 10 },
  { id: 'breakfast', at: at(2, 9, 10), from: '家里', text: '吃饭了没？', reply: '吃了。', mood: 8 },
];
