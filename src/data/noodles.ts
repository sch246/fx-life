// 泡面：一桶面放在小桌上，一步步做。泡面自己是主角，不认具体是哪个容器的热水。
// 桌上这桶面的状态在 state.things 的「noodle.*」里：
//   stage 0 桌上没有面；1 封着；2 撕开了；3 料包和叉子拿出来了；4 冲了热水；5 盖上盖子泡着；6 揭开了。
// 料包放没放（sauce、salt、veg），冲水的时刻（since）、水里生水的比例（raw），盖过没有（covered），开吃的时刻（ate）。
// 冲上热水后面就在泡：三分钟前还硬，三到十分钟正好，再久就坨了。揭开看一眼还能盖回去，面照样在泡。
// 数值是第一版初值，按试玩调。

import type { ActionDef, Effect } from '../core/rules';
import type { GameState } from '../core/state';
import { drinkBars, hotSource, vessel, w } from './water';

export const NOODLES = {
  /** 一桶面冲多少升热水。 */
  water: 0.5,
  /** 泡够三分钟才软；超过十分钟就坨了。 */
  readyMin: 3,
  soggyMin: 10,
  /** 吃面时顺带喝下多少汤（升），里面没烧开过的水照样伤身体。 */
  soup: 0.25,
  eatMin: 10,
};

export const PACKETS = [
  { id: 'sauce', name: '酱包' },
  { id: 'salt', name: '盐包' },
  { id: 'veg', name: '菜包' },
] as const;

export const n = (s: GameState, prop: string) => s.things[`noodle.${prop}`] ?? 0;
export const stage = (s: GameState) => n(s, 'stage');
const at = (...stages: number[]) => (s: GameState) => stages.includes(stage(s));
/** 冲上水之后泡了多久（开吃之后就按开吃那一刻算）。 */
export const soakedFor = (s: GameState) => (n(s, 'ate') || s.t) - n(s, 'since');
/** 0 还硬，1 正好，2 坨了。 */
export const quality = (s: GameState) => {
  const t = soakedFor(s);
  return t < NOODLES.readyMin ? 0 : t <= NOODLES.soggyMin ? 1 : 2;
};
export const missingPackets = (s: GameState) => PACKETS.filter((p) => !n(s, p.id)).length;
/** 按规矩泡好的一桶：料包都放了、盖着泡、三到十分钟之间开吃。 */
export const doneRight = (s: GameState) => quality(s) === 1 && missingPackets(s) === 0 && !!n(s, 'covered');

/** 从箱子里拿一桶放到桌上：之前那桶的痕迹都清掉。 */
export const NEW_CUP: Record<string, number> = {
  'noodle.stage': 1,
  'noodle.sauce': 0,
  'noodle.salt': 0,
  'noodle.veg': 0,
  'noodle.since': 0,
  'noodle.raw': 0,
  'noodle.covered': 0,
  'noodle.ate': 0,
};

/** 泡面这件事的手动步骤。都在小桌上，一下就做完；吃要十分钟。 */
export const NOODLE_ACTIONS: readonly ActionDef[] = [
  {
    id: 'take-noodles',
    object: 'bag',
    label: '拿一桶面',
    temper: 'impulse',
    requires: (s) => (s.items.noodles ?? 0) > 0 && stage(s) === 0,
    onStart: { items: { noodles: -1 }, set: NEW_CUP },
    line: '从箱子里拿出一桶面，放在桌上。',
  },
  {
    id: 'noodle-tear',
    object: 'table',
    label: '撕开包装',
    temper: 'impulse',
    requires: at(1),
    onStart: { set: { 'noodle.stage': 2 }, flags: ['tried:soak'] },
  },
  {
    id: 'noodle-unpack',
    object: 'table',
    label: '拿出料包和叉子',
    temper: 'impulse',
    requires: at(2),
    onStart: { set: { 'noodle.stage': 3 } },
  },
  ...PACKETS.map(
    (p): ActionDef => ({
      id: `noodle-${p.id}`,
      object: 'table',
      label: `放${p.name}`,
      temper: 'impulse',
      requires: (s) => (stage(s) === 3 || stage(s) === 4) && !n(s, p.id),
      onStart: { set: { [`noodle.${p.id}`]: 1 } },
    }),
  ),
  {
    id: 'noodle-pour',
    object: 'table',
    label: '冲热水',
    temper: 'impulse',
    requires: (s) => stage(s) === 3 && !!hotSource(s, NOODLES.water),
    onStart: (s): Effect => {
      const src = hotSource(s, NOODLES.water)!.id;
      return {
        things: { [`${src}.water`]: -NOODLES.water },
        set: { 'noodle.stage': 4, 'noodle.since': s.t, 'noodle.raw': w(s, src, 'raw') },
      };
    },
    line: (s) => `把${vessel(hotSource(s, NOODLES.water)!.id).name}里的热水冲进面里。`,
  },
  {
    id: 'noodle-cover',
    object: 'table',
    label: '盖上盖子，用叉子压住',
    temper: 'impulse',
    requires: (s) => at(4, 6)(s) && !n(s, 'ate'),
    onStart: { set: { 'noodle.stage': 5, 'noodle.covered': 1 } },
  },
  {
    id: 'noodle-open',
    object: 'table',
    label: '揭开盖子',
    temper: 'impulse',
    requires: at(5),
    onStart: { set: { 'noodle.stage': 6 } },
    line: (s) => ['面还硬着。', '泡好了。', '面泡坨了。'][quality(s)],
  },
  {
    // 开吃那一刻定下这碗面：泡了多久、料包放全没有、汤里有没有生水。吃到一半走开，回来接着吃。
    id: 'noodle-eat',
    object: 'table',
    label: '吃面',
    temper: 'impulse',
    requires: (s) => stage(s) === 6 && s.ongoing?.actionId !== 'noodle-eat',
    minutes: NOODLES.eatMin,
    onStart: (s) =>
      n(s, 'ate') ? {} : { set: { 'noodle.ate': s.t }, accum: doneRight(s) ? { 'skill:soak': 1 } : undefined },
    onEnd: (s): Effect => {
      const q = quality(s);
      const bars: Record<string, number> = { stamina: [40, 55, 50][q] };
      const mood = (q === 2 ? -3 : 0) + (missingPackets(s) ? -1 : 0);
      if (mood) bars.mood = mood;
      const drink = drinkBars(NOODLES.soup, n(s, 'raw'));
      bars.water = drink.water;
      if (drink.fitness) bars.fitness = drink.fitness;
      return { bars, set: { 'noodle.stage': 0 } };
    },
    endLine: (s) => {
      const notes = ['一桶面吃完了。'];
      if (missingPackets(s)) notes.push('料没放全，有点淡。');
      if (n(s, 'raw') > 0.01) notes.push('汤里有股生水味。');
      return notes.join('');
    },
    pose: 'eat',
  },
  {
    id: 'noodle-dry',
    object: 'table',
    label: '干吃',
    temper: 'impulse',
    requires: at(2, 3),
    minutes: NOODLES.eatMin,
    onStart: { set: { 'noodle.stage': 0 } },
    onEnd: { bars: { stamina: 30, mood: -2 } },
    line: '把面饼掰开，干嚼了一块。',
    pose: 'eat',
  },
];

/** 泡面做熟之后的自动：小人自己拿一桶、冲上热水、盖好、等三分钟、吃完。 */
export const AUTO_NOODLES: Omit<ActionDef, 'requires'> = {
  id: 'auto-noodles',
  object: 'table',
  label: '泡面',
  temper: 'impulse',
  auto: true,
  minutes: 2 + NOODLES.readyMin + NOODLES.eatMin,
  onStart: (s): Effect => {
    const src = hotSource(s, NOODLES.water)!.id;
    return {
      items: { noodles: -1 },
      things: { [`${src}.water`]: -NOODLES.water },
      set: { 'noodle.raw': w(s, src, 'raw') },
    };
  },
  onEnd: (s): Effect => {
    const drink = drinkBars(NOODLES.soup, n(s, 'raw'));
    return { bars: { stamina: 55, ...drink } };
  },
  line: '泡上一桶面，盖好，等三分钟。',
  endLine: '一桶面吃完了。',
  pose: 'eat',
};

