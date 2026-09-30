// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作能不能做由 temper、requires 等规则决定；所属物件据此上色或变灰。
// 数值是第一版初值，按试玩调。

import type { ActionDef } from '../core/rules';
import type { GameState } from '../core/state';
import { moodLv } from '../core/rules';
import { MESSAGES } from './messages';
import { roomLight, sleepQuality } from './room';

const rested = (s: GameState) => (s.bars.energy ?? 0) >= 100;
const starving = (s: GameState) => (s.bars.stamina ?? 0) < 15;
/** 自然醒：睡足且房间亮了，或者饿醒。 */
const wakeUp = (s: GameState) => (rested(s) && roomLight(s) > 0.2) || starving(s);

const SLEEP: Omit<ActionDef, 'id' | 'label'> = {
  object: 'bed',
  temper: 'impulse',
  perHour: { bars: { energy: 12 } },
  rate: sleepQuality,
  stopWhen: wakeUp,
  stopLabel: '醒来',
  endLine: '醒了。',
  pose: 'sleep',
};

export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'look',
    object: 'window',
    label: '看窗外',
    temper: 'impulse',
    minutes: 10,
    perHour: { bars: { mood: 6 } },
    pose: 'look',
  },
  {
    id: 'lie',
    object: 'bed',
    label: '躺着',
    temper: 'impulse',
    perHour: { bars: { energy: 1.5, mood: 1 } },
    stopLabel: '起来',
    pose: 'lie',
  },
  { ...SLEEP, id: 'sleep', label: '睡觉', line: '躺下，闭上眼睛。' },
  // 睡眠跳过：和睡觉是同一件事，只是开始后快进到醒来。出现条件见 data/reveals。
  { ...SLEEP, id: 'sleep-skip', label: '睡到醒', skip: true, requires: (s) => moodLv(s) >= 1, line: '躺下，一觉睡到醒。' },
  {
    id: 'noodles',
    object: 'bag',
    label: '吃泡面',
    temper: 'impulse',
    requires: (s) => (s.items.noodles ?? 0) > 0,
    minutes: 15,
    onStart: { items: { noodles: -1 } },
    onEnd: { bars: { stamina: 55 } },
    line: '泡了一包面。',
    pose: 'eat',
  },
  {
    id: 'unpack',
    object: 'bag',
    label: '整理行李',
    temper: 'discipline',
    requires: (s) => !s.flags.unpacked,
    minutes: 40,
    onEnd: { bars: { mood: 6 }, flags: ['unpacked'] },
    line: '把行李里的东西一件件拿出来。',
    endLine: '东西都放好了。',
  },
  ...MESSAGES.map(
    (m): ActionDef => ({
      id: `reply-${m.id}`,
      object: 'phone',
      label: `回复${m.from}`,
      temper: 'impulse',
      requires: (s) => !!s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`],
      minutes: 5,
      onStart: { flags: [`replied:${m.id}`] },
      onEnd: { bars: { mood: m.mood } },
      line: `${m.from}：「${m.text}」你回：「${m.reply}」`,
    }),
  ),
  {
    id: 'go-out',
    object: 'door',
    label: '出门',
    temper: 'discipline',
    onStart: { flags: ['went-out'] },
    line: '推开门，走了出去。',
  },
];
