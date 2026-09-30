// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作能不能做由 temper、requires、occupies 等规则决定；所属物件据此上色或变灰，菜单里只列能做的。
// auto 的动作是「自动」：出现在技能栏里，学会之后才能用（data/skills）。
// 数值是第一版初值，按试玩调。

import type { ActionDef, Effect } from '../core/rules';
import type { GameState } from '../core/state';
import { moodLv } from '../core/rules';
import { MESSAGES } from './messages';
import { learned } from './skills';
import { fallAsleepMin, roomLight, sleepQuality } from './room';
import { WATER, dispenserWater, drinkBars, fill, hotSource, k, pour, vessel, w } from './water';
import { AUTO_NOODLES, NOODLES, NOODLE_ACTIONS, stage } from './noodles';

const rested = (s: GameState) => (s.bars.energy ?? 0) >= 100;
const starving = (s: GameState) => (s.bars.stamina ?? 0) < 15;
/** 自然醒：睡足且房间亮了，或者饿醒。 */
const wakeUp = (s: GameState) => (rested(s) && roomLight(s) > 0.2) || starving(s);

/** 躺在床上（还没睡）：睡觉要先躺下。 */
const lying = (s: GameState) => s.ongoing?.actionId === 'lie';

const SLEEP: Omit<ActionDef, 'id' | 'label'> = {
  object: 'bed',
  temper: 'impulse',
  requires: lying,
  perHour: { bars: { energy: 12 } },
  rate: sleepQuality,
  stopWhen: wakeUp,
  stopLabel: '起来',
  endLine: '醒了。',
  // 躺下一会儿才睡着；睡着之前还能看看手机。
  occupies: (s, since) => since >= fallAsleepMin(s),
  pose: (s) => (s.ongoing?.occupies ? 'sleep' : 'lie'),
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
    // 不在床上时，床上只有「躺下」；躺上去之后才能睡。
    id: 'lie',
    object: 'bed',
    label: '躺下',
    temper: 'impulse',
    perHour: { bars: { energy: 1.5, mood: 1 } },
    stopLabel: '起来',
    pose: 'lie',
  },
  { ...SLEEP, id: 'sleep', label: '睡觉', line: '闭上眼睛。' },
  // 睡眠跳过：和睡觉是同一件事，只是开始后快进到醒来。出现条件见 data/reveals。
  { ...SLEEP, id: 'sleep-skip', label: '睡到醒', skip: true, requires: (s) => lying(s) && moodLv(s) >= 1, line: '闭上眼睛，一觉睡到醒。' },
  {
    // 行李箱近景里的衣服：心情到 lv1 后才浮现，需要自律。
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
  // ---- 水壶：接水、开关、倒进饮水机。烧开、烧干、变凉由 data/water 的过程推进。 ----
  {
    id: 'fill-kettle',
    object: 'kettle',
    label: '接满水',
    temper: 'impulse',
    requires: (s) => !k(s, 'on') && k(s, 'water') < vessel('kettle').capacity - 0.01,
    minutes: 1,
    onStart: (s) => fill(s, 'kettle'),
    line: '去接了一壶水。',
  },
  {
    id: 'kettle-on',
    object: 'kettle',
    label: '打开开关',
    temper: 'impulse',
    requires: (s) => !k(s, 'on') && !k(s, 'broken'),
    onStart: { set: { 'kettle.on': 1 }, flags: ['tried:boil'] },
  },
  {
    // 水开着的时候亲手关掉：这一次烧水算是做成了。
    id: 'kettle-off',
    object: 'kettle',
    label: '关掉开关',
    temper: 'impulse',
    requires: (s) => !!k(s, 'on'),
    onStart: (s) => ({
      set: { 'kettle.on': 0 },
      accum: k(s, 'temp') >= 100 && k(s, 'water') > 0 ? { 'skill:boil': 1 } : undefined,
    }),
  },
  {
    id: 'pour-dispenser',
    object: 'kettle',
    label: '倒进饮水机',
    temper: 'impulse',
    requires: (s) => k(s, 'water') > 0 && !k(s, 'on') && dispenserWater(s) < vessel('dispenser').capacity - 0.01,
    minutes: 1,
    onStart: (s) => pour(s, 'kettle', 'dispenser', k(s, 'water')),
    line: '把水倒进饮水机。',
  },
  {
    // 会烧水之后：小人自己接满水、打开开关，然后去做别的；水开了顺手关掉。
    // 开关已经被关掉（亲手关的）也就不用管了。
    id: 'auto-boil',
    object: 'kettle',
    label: '烧水',
    temper: 'impulse',
    auto: true,
    background: true,
    requires: (s) => learned(s, 'boil') && !k(s, 'broken') && !k(s, 'on'),
    onStart: (s): Effect => ({ set: { ...fill(s, 'kettle').set, 'kettle.on': 1 } }),
    stopWhen: (s) => !k(s, 'on') || k(s, 'temp') >= 100 || !!k(s, 'broken'),
    onEnd: { set: { 'kettle.on': 0 } },
    line: '接上一壶水，打开开关。',
    endLine: (s) => (!k(s, 'on') ? '' : k(s, 'temp') >= 100 ? '顺手把水壶关了。' : '把水壶关了。'),
  },
  // ---- 泡面：放在小桌上一步步做，见 data/noodles ----
  ...NOODLE_ACTIONS,
  {
    ...AUTO_NOODLES,
    requires: (s) => learned(s, 'soak') && (s.items.noodles ?? 0) > 0 && stage(s) === 0 && !!hotSource(s, NOODLES.water),
  },
  // ---- 饮水机 ----
  {
    // 一杯水一下子喝完；饮水机里没烧开过的水，喝下去伤身体（行动前的预览里能看到）。
    id: 'drink',
    object: 'dispenser',
    label: '喝一杯水',
    temper: 'impulse',
    requires: (s) => dispenserWater(s) >= WATER.glass - 0.001,
    minutes: 2,
    onStart: (s) => ({
      things: { 'dispenser.water': -WATER.glass },
      bars: drinkBars(WATER.glass, w(s, 'dispenser', 'raw')),
    }),
    line: (s) => (w(s, 'dispenser', 'raw') > 0.01 ? '接了一杯水喝。有股生水味。' : '接了一杯水喝。'),
  },
  // 手机：躺着、坐着都能看，回消息只用手，不起身。
  ...MESSAGES.map(
    (m): ActionDef => ({
      id: `reply-${m.id}`,
      object: 'phone',
      label: m.reply,
      temper: 'impulse',
      hands: true,
      requires: (s) => !!s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`],
      onStart: { flags: [`replied:${m.id}`], bars: { mood: m.mood } },
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
