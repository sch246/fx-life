// 水壶、桌上泡着的面、饮水机：物件自己的状态和物理过程。
// 小人在不在旁边，这些都照常发生：水烧开、慢慢烧干、关掉后慢慢变凉、面泡久了会坨。
// 数值是第一版初值，按试玩调。

import type { GameState } from '../core/state';
import type { ProcessDef } from '../core/world';
import { say } from '../core/feed';

export const KETTLE = {
  /** 满壶 1.5 升，一桶面用 0.5 升，所以一壶最多泡三桶。 */
  capacity: 1.5,
  perCup: 0.5,
  /** 自来水的温度；烧开是 100。 */
  roomTemp: 20,
  /** 从凉水到烧开 5 分钟。 */
  heatPerMin: 16,
  /** 开着不关，满壶水 30 分钟烧干。 */
  boilOffPerMin: 1.5 / 30,
  /** 关掉后每分钟降一度：30 分钟从 100 降到 70，就不够烫了。 */
  coolPerMin: 1,
  /** 多少度以上算热水，能泡面，壶身发红。 */
  hotTemp: 70,
  /** 没水还开着，干烧几分钟就烧坏。 */
  dryBreakMin: 5,
};

export const NOODLES = {
  /** 泡够三分钟才软；超过十分钟就坨了。 */
  readyMin: 3,
  soggyMin: 10,
};

/** 饮水机最多装多少升；一杯水多少升。 */
export const DISPENSER = { capacity: 5, perGlass: 0.25 };

export const k = (s: GameState, prop: string) => s.things[`kettle.${prop}`] ?? 0;
/** 热水：这壶水烧开过，而且还没凉下去。没烧开的温水不算。 */
export const kettleHot = (s: GameState) => k(s, 'water') > 0 && !!k(s, 'boiled') && k(s, 'temp') >= KETTLE.hotTemp;
export const kettleBoiling = (s: GameState) => k(s, 'on') > 0 && k(s, 'water') > 0 && k(s, 'temp') >= 100;
export const soaking = (s: GameState) => (s.things['table.soaking'] ?? 0) > 0;
export const soakedFor = (s: GameState) => s.t - (s.things['table.since'] ?? s.t);
export const dispenserWater = (s: GameState) => s.things['dispenser.water'] ?? 0;

/** 往壶里接满水：新接的凉水和壶里剩下的水混在一起。 */
export function fillKettle(s: GameState) {
  const w = k(s, 'water');
  const add = KETTLE.capacity - w;
  const temp = w + add > 0 ? (w * k(s, 'temp') + add * KETTLE.roomTemp) / (w + add) : KETTLE.roomTemp;
  return { set: { 'kettle.water': KETTLE.capacity, 'kettle.temp': temp, 'kettle.boiled': 0 } };
}

export const PROCESSES: readonly ProcessDef[] = [
  {
    id: 'kettle',
    step: (s) => {
      const T = s.things;
      if (T['kettle.broken']) {
        T['kettle.temp'] = Math.max(KETTLE.roomTemp, k(s, 'temp') - KETTLE.coolPerMin);
        return;
      }
      if (k(s, 'on')) {
        if (k(s, 'water') > 0) {
          T['kettle.dry'] = 0;
          if (k(s, 'temp') < 100) {
            T['kettle.temp'] = Math.min(100, k(s, 'temp') + KETTLE.heatPerMin);
            if (T['kettle.temp'] >= 100) {
              T['kettle.boiled'] = 1;
              say(s, '水开了，壶嘴冒着白气。');
            }
          } else {
            T['kettle.water'] = Math.max(0, k(s, 'water') - KETTLE.boilOffPerMin);
            if (T['kettle.water'] === 0) say(s, '水壶里的水烧干了。');
          }
        } else {
          T['kettle.dry'] = k(s, 'dry') + 1;
          if (T['kettle.dry'] >= KETTLE.dryBreakMin) {
            T['kettle.broken'] = 1;
            T['kettle.on'] = 0;
            say(s, '一股焦味。水壶烧坏了。');
          }
        }
      } else {
        T['kettle.temp'] = Math.max(KETTLE.roomTemp, k(s, 'temp') - KETTLE.coolPerMin);
      }
    },
  },
];

/** 开局时这些东西的状态：水壶是空的，饮水机是空的，桌上没有泡着的面。 */
export const START_THINGS: Record<string, number> = {
  'kettle.water': 0,
  'kettle.temp': KETTLE.roomTemp,
  'dispenser.water': 0,
};
