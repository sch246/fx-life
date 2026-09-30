// 水：装水的东西（水壶、饮水机，以后还会有保温壶、锅……）共用同一套物理。
// 每个容器在 state.things 里有「容器.water」（升）、「容器.temp」（度）、「容器.raw」（没烧开过的水占几成）。
// - 自来水是凉的生水；烧到 100 度，这些水就算烧开过了。
// - 不加热的容器每分钟慢慢凉回室温；有加热器的容器开着时升温，烧开后慢慢烧干，干烧会坏。
// - 倒来倒去，温度和生水的比例按水量混合。
// - 喝下没烧开过的水伤身体：按喝下去的生水量扣体能。
// 用水的地方（泡面、喝水）只问「哪里有够烫的水」，不认具体是哪个容器。
// 小人在不在旁边，这些都照常发生。数值是第一版初值，按试玩调。

import type { Effect } from '../core/rules';
import type { GameState } from '../core/state';
import type { ProcessDef } from '../core/world';
import { say } from '../core/feed';

export const WATER = {
  /** 自来水和房间的温度。 */
  roomTemp: 20,
  /** 不加热时每分钟降一度：从 100 度 30 分钟降到 70 度，就不够烫了。 */
  coolPerMin: 1,
  /** 多少度以上算热水，能泡面，壶身发红。 */
  hotTemp: 70,
  /** 喝下一升没烧开过的水，体能掉多少。一杯 0.25 升就是 5。 */
  rawFitnessPerLiter: -20,
  /** 一杯水多少升、补多少水分。 */
  glass: 0.25,
  glassWater: 35,
};

export interface HeaterDef {
  /** 每分钟升几度：从凉水到烧开 5 分钟。 */
  heatPerMin: number;
  /** 烧开后还开着，每分钟烧掉多少升。 */
  boilOffPerMin: number;
  /** 没水还开着，干烧几分钟就坏。 */
  dryBreakMin: number;
  boiledLine: string;
  dryLine: string;
  brokenLine: string;
}

export interface VesselDef {
  id: string;
  name: string;
  capacity: number;
  heater?: HeaterDef;
}

export const VESSELS: readonly VesselDef[] = [
  {
    // 满壶 1.5 升，一桶面用 0.5 升，所以一壶最多泡三桶。开着不关，满壶 30 分钟烧干。
    id: 'kettle',
    name: '水壶',
    capacity: 1.5,
    heater: {
      heatPerMin: 16,
      boilOffPerMin: 1.5 / 30,
      dryBreakMin: 5,
      boiledLine: '水开了，壶嘴冒着白气。',
      dryLine: '水壶里的水烧干了。',
      brokenLine: '一股焦味。水壶烧坏了。',
    },
  },
  { id: 'dispenser', name: '饮水机', capacity: 5 },
];

export const vessel = (id: string) => VESSELS.find((v) => v.id === id)!;
export const w = (s: GameState, id: string, prop: string) => s.things[`${id}.${prop}`] ?? 0;
export const k = (s: GameState, prop: string) => w(s, 'kettle', prop);
export const dispenserWater = (s: GameState) => w(s, 'dispenser', 'water');

/** 某个容器里有没有这么多够烫的水。 */
export const hasHot = (s: GameState, id: string, liters: number) =>
  w(s, id, 'water') >= liters - 1e-6 && w(s, id, 'temp') >= WATER.hotTemp;
/** 哪里有这么多够烫的水：按容器表的顺序找第一个。 */
export const hotSource = (s: GameState, liters: number) => VESSELS.find((v) => hasHot(s, v.id, liters));
export const kettleBoiling = (s: GameState) => !!k(s, 'on') && k(s, 'water') > 0 && k(s, 'temp') >= 100;

/** 两份水混在一起后的温度和生水比例。 */
function mix(s: GameState, id: string, add: number, temp: number, raw: number) {
  const have = w(s, id, 'water');
  const total = have + add;
  if (total <= 0) return { temp: WATER.roomTemp, raw: 0 };
  return {
    temp: (have * w(s, id, 'temp') + add * temp) / total,
    raw: (have * w(s, id, 'raw') + add * raw) / total,
  };
}

/** 接满自来水：凉的生水，和容器里剩下的水混在一起。 */
export function fill(s: GameState, id: string): Effect {
  const add = vessel(id).capacity - w(s, id, 'water');
  const m = mix(s, id, add, WATER.roomTemp, 1);
  return { set: { [`${id}.water`]: vessel(id).capacity, [`${id}.temp`]: m.temp, [`${id}.raw`]: m.raw } };
}

/** 从一个容器倒进另一个容器。 */
export function pour(s: GameState, from: string, to: string, liters: number): Effect {
  const amount = Math.min(liters, w(s, from, 'water'), vessel(to).capacity - w(s, to, 'water'));
  const m = mix(s, to, amount, w(s, from, 'temp'), w(s, from, 'raw'));
  return {
    things: { [`${from}.water`]: -amount },
    set: { [`${to}.water`]: w(s, to, 'water') + amount, [`${to}.temp`]: m.temp, [`${to}.raw`]: m.raw },
  };
}

/** 喝下这么多水（生水比例 raw）对身体的影响：补水分；没烧开过的部分扣体能。 */
export const drinkBars = (liters: number, raw: number): Record<string, number> => {
  const bars: Record<string, number> = { water: (WATER.glassWater * liters) / WATER.glass };
  if (raw > 0.01) bars.fitness = WATER.rawFitnessPerLiter * liters * raw;
  return bars;
};

function stepVessel(s: GameState, v: VesselDef): void {
  const T = s.things;
  const key = (p: string) => `${v.id}.${p}`;
  const h = v.heater;
  const cool = () => {
    T[key('temp')] = Math.max(WATER.roomTemp, w(s, v.id, 'temp') - WATER.coolPerMin);
  };
  if (!h || !w(s, v.id, 'on') || w(s, v.id, 'broken')) return cool();
  if (w(s, v.id, 'water') > 0) {
    T[key('dry')] = 0;
    if (w(s, v.id, 'temp') < 100) {
      T[key('temp')] = Math.min(100, w(s, v.id, 'temp') + h.heatPerMin);
      if (T[key('temp')] >= 100) {
        T[key('raw')] = 0;
        say(s, h.boiledLine);
      }
    } else {
      T[key('water')] = Math.max(0, w(s, v.id, 'water') - h.boilOffPerMin);
      if (T[key('water')] === 0) say(s, h.dryLine);
    }
  } else {
    T[key('dry')] = w(s, v.id, 'dry') + 1;
    if (T[key('dry')] >= h.dryBreakMin) {
      T[key('broken')] = 1;
      T[key('on')] = 0;
      say(s, h.brokenLine);
    }
  }
}

export const WATER_PROCESS: ProcessDef = {
  id: 'water',
  step: (s) => {
    for (const v of VESSELS) stepVessel(s, v);
  },
};

/** 开局：水壶和饮水机都是空的。 */
export const START_WATER: Record<string, number> = Object.fromEntries(
  VESSELS.flatMap((v) => [
    [`${v.id}.water`, 0],
    [`${v.id}.temp`, WATER.roomTemp],
    [`${v.id}.raw`, 0],
  ]),
);
