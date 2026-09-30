// 行动数据表：每个行动是一行，写成条、钱、时间和长期积累的变化（见 core/rules）。
// 动作能不能做由 temper、requires、occupies 等规则决定；所属物件据此上色或变灰。
// auto 的动作是「自动」：手动做成功过一次（熟练度）才浮现，见 data/reveals。
// 数值是第一版初值，按试玩调。

import type { ActionDef, Effect } from '../core/rules';
import type { GameState } from '../core/state';
import { moodLv } from '../core/rules';
import { MESSAGES } from './messages';
import { learned } from './skills';
import { roomLight, sleepQuality } from './room';
import { DISPENSER, KETTLE, NOODLES, dispenserWater, fillKettle, k, kettleHot, soakedFor, soaking } from './kettle';

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
  occupies: true,
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
    // 行李箱近景里的桶面：一次拿一桶。
    id: 'take-noodles',
    object: 'bag',
    label: '拿一桶面',
    temper: 'impulse',
    requires: (s) => (s.items.noodles ?? 0) > 0 && (s.items.cup ?? 0) < 1,
    onStart: { items: { noodles: -1, cup: 1 } },
    line: '从箱子里拿出一桶面。',
  },
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
  // ---- 水壶：接水、开关、冲面、倒进饮水机。烧开、烧干、变凉由 data/kettle 的过程推进。 ----
  {
    id: 'fill-kettle',
    object: 'kettle',
    label: '接满水',
    temper: 'impulse',
    requires: (s) => !k(s, 'on') && k(s, 'water') < KETTLE.capacity - 0.01,
    minutes: 1,
    onStart: fillKettle,
    line: '去接了一壶水。',
  },
  {
    id: 'kettle-on',
    object: 'kettle',
    label: '打开开关',
    temper: 'impulse',
    requires: (s) => !k(s, 'on') && !k(s, 'broken'),
    onStart: { set: { 'kettle.on': 1 } },
  },
  {
    // 水开过、壶里还有水时亲手关掉：这一次烧水算是做成了。
    id: 'kettle-off',
    object: 'kettle',
    label: '关掉开关',
    temper: 'impulse',
    requires: (s) => !!k(s, 'on'),
    onStart: (s) => ({
      set: { 'kettle.on': 0 },
      accum: k(s, 'boiled') && k(s, 'water') > 0 ? { 'skill:boil': 1 } : undefined,
    }),
  },
  {
    id: 'pour-cup',
    object: 'kettle',
    label: '冲一桶面',
    temper: 'impulse',
    requires: (s) => (s.items.cup ?? 0) > 0 && kettleHot(s) && k(s, 'water') >= KETTLE.perCup - 0.001 && !soaking(s),
    onStart: (s) => ({
      items: { cup: -1 },
      things: { 'kettle.water': -KETTLE.perCup },
      set: { 'table.soaking': 1, 'table.since': s.t },
    }),
    line: '把开水冲进面里，盖上盖子，放在桌上。',
  },
  {
    id: 'pour-dispenser',
    object: 'kettle',
    label: '倒进饮水机',
    temper: 'impulse',
    requires: (s) => k(s, 'water') > 0 && !k(s, 'on') && dispenserWater(s) < DISPENSER.capacity,
    minutes: 1,
    onStart: (s) => {
      const amount = Math.min(k(s, 'water'), DISPENSER.capacity - dispenserWater(s));
      return { things: { 'kettle.water': -amount, 'dispenser.water': amount } };
    },
    line: '把水倒进饮水机。',
  },
  {
    // 会烧水之后：小人自己接水、守着、水开了就关掉。
    id: 'auto-boil',
    object: 'kettle',
    label: '自动烧水',
    temper: 'impulse',
    auto: true,
    requires: (s) => learned(s, 'boil') && !k(s, 'broken') && !k(s, 'on'),
    onStart: (s) => {
      const fill = fillKettle(s);
      return { set: { ...fill.set, 'kettle.on': 1, 'kettle.boiled': 0 } };
    },
    stopWhen: (s) => k(s, 'temp') >= 100 || !!k(s, 'broken'),
    onEnd: { set: { 'kettle.on': 0 } },
    stopLabel: '不等了',
    line: '接上一壶水，守在水壶边等它开。',
    pose: 'kettle',
  },
  // ---- 小桌：泡着的面、干吃、自动泡面 ----
  {
    // 揭开的时机决定这碗面：泡够三分钟才软，超过十分钟就坨了。
    id: 'open-noodles',
    object: 'table',
    label: '揭开吃面',
    temper: 'impulse',
    requires: soaking,
    minutes: 10,
    onStart: (s) => {
      const t = soakedFor(s);
      const q = t < NOODLES.readyMin ? 0 : t <= NOODLES.soggyMin ? 1 : 2;
      return { set: { 'table.soaking': 0, 'table.meal': q }, accum: q === 1 ? { 'skill:soak': 1 } : undefined };
    },
    onEnd: (s): Effect => {
      const q = s.things['table.meal'] ?? 1;
      return q === 0 ? { bars: { stamina: 40 } } : q === 1 ? { bars: { stamina: 55 } } : { bars: { stamina: 50, mood: -3 } };
    },
    line: (s) => {
      const t = soakedFor(s);
      return t < NOODLES.readyMin ? '面还有点硬。' : t <= NOODLES.soggyMin ? '面泡得正好。' : '面坨了。';
    },
    endLine: '一桶面吃完了。',
    pose: 'eat',
  },
  {
    id: 'dry-noodles',
    object: 'table',
    label: '干吃',
    temper: 'impulse',
    requires: (s) => (s.items.cup ?? 0) > 0,
    minutes: 10,
    onStart: { items: { cup: -1 } },
    onEnd: { bars: { stamina: 30, mood: -2 } },
    line: '把面饼掰开，干嚼了一块。',
    pose: 'eat',
  },
  {
    // 会泡面之后：小人自己拿一桶、冲上热水、等三分钟、吃完。
    id: 'auto-noodles',
    object: 'table',
    label: '自动泡面',
    temper: 'impulse',
    auto: true,
    requires: (s) => learned(s, 'soak') && (s.items.noodles ?? 0) > 0 && kettleHot(s) && k(s, 'water') >= KETTLE.perCup - 0.001 && !soaking(s),
    minutes: 13,
    onStart: { items: { noodles: -1 }, things: { 'kettle.water': -KETTLE.perCup } },
    onEnd: { bars: { stamina: 55 } },
    line: '泡上一桶面，等三分钟再吃。',
    endLine: '一桶面吃完了。',
    pose: 'eat',
  },
  // ---- 饮水机 ----
  {
    id: 'drink',
    object: 'dispenser',
    label: '喝一杯水',
    temper: 'impulse',
    requires: (s) => dispenserWater(s) >= DISPENSER.perGlass - 0.001,
    minutes: 2,
    onStart: { things: { 'dispenser.water': -DISPENSER.perGlass } },
    onEnd: { bars: { water: 35 } },
    line: '接了一杯水喝。',
  },
  ...MESSAGES.map(
    (m): ActionDef => ({
      id: `reply-${m.id}`,
      object: 'phone',
      label: m.reply,
      temper: 'impulse',
      requires: (s) => !!s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`],
      minutes: 5,
      onStart: { flags: [`replied:${m.id}`] },
      onEnd: { bars: { mood: m.mood } },
      pose: 'phone',
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
