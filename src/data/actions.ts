// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作能不能做由 temper、requires 等规则决定；所属物件据此上色或变灰。
// 数值是初值，按试玩调整。

import type { ActionDef } from '../core/rules';
import { sleepRate } from './body';

const has = (id: string) => (s: { items: Record<string, number> }) => (s.items[id] ?? 0) > 0;

export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'look',
    object: 'window',
    label: '看窗外',
    temper: 'impulse',
    minutes: 10,
    onEnd: { bars: { mood: 6 } },
    freshMin: 60,
    line: '看了一会儿窗外。',
  },
  {
    id: 'lie',
    object: 'bed',
    label: '躺着',
    temper: 'always',
    perHour: { bars: { energy: 4, mood: 1 } },
    line: '躺了下来。',
    stopLine: '坐了起来。',
  },
  {
    id: 'sleep',
    object: 'bed',
    label: '睡觉',
    temper: 'always',
    // 精神着的时候睡不着。
    requires: (s) => (s.bars.energy ?? 0) < 90,
    blockedText: '还不困',
    perHour: { bars: { energy: 9 } },
    rate: sleepRate,
    until: (s) => (s.bars.energy ?? 0) >= 100,
    skip: 'act:skip-sleep',
    line: '睡了。',
    endLine: '醒了。睡够了。',
    stopLine: '醒了。',
  },
  {
    id: 'eat-noodles',
    object: 'bag',
    label: '吃泡面',
    temper: 'impulse',
    requires: has('noodles'),
    blockedText: '没有了',
    minutes: 10,
    onStart: { items: { noodles: -1 } },
    onEnd: { bars: { hunger: -100 } },
    line: '烧了壶水，泡了一包面。',
  },
  {
    id: 'unpack',
    object: 'bag',
    label: '整理行李',
    temper: 'discipline',
    requires: (s) => !s.accum.unpacked,
    minutes: 30,
    onEnd: { bars: { mood: 12 }, accum: { unpacked: 1 } },
    line: '把行李一件件拿出来。',
    endLine: '东西都有了地方。',
  },
  {
    id: 'reply-home-1',
    object: 'phone',
    label: '回复家里',
    temper: 'always',
    requires: has('msg:home-1'),
    onStart: { items: { 'msg:home-1': -1 }, bars: { mood: 8 } },
    line: '回：「到了，房间挺好的。」',
  },
  {
    id: 'reply-home-2',
    object: 'phone',
    label: '回复家里',
    temper: 'always',
    requires: has('msg:home-2'),
    onStart: { items: { 'msg:home-2': -1 }, bars: { mood: 5 } },
    line: '回：「吃了。」',
  },
  {
    id: 'wash',
    object: 'sink',
    label: '洗脸',
    temper: 'discipline',
    minutes: 5,
    onEnd: { bars: { mood: 5 } },
    freshMin: 180,
    line: '用凉水洗了把脸。',
  },
  {
    id: 'go-out',
    object: 'door',
    label: '出门',
    temper: 'discipline',
    line: '穿上鞋，推开了门。',
  },
];

/** 当前演示在这些行动发生后结束（第一片止于第一次出门）。 */
/** 物品的名字（用于行动预览和完整状态）。不在表里的物品不显示。 */
export const ITEM_NAMES: Record<string, string> = { noodles: '泡面' };

export const DEMO_END_ACTIONS: readonly string[] = ['go-out'];
