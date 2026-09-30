// 泡面：一桶面放在小桌上，一步步做。泡面自己是主角，不认具体是哪个容器的热水。
// 桌上这桶面的状态在 state.things 的「noodle.*」里：
//   stage 0 桌上没有面；1 封着；2 撕开了；3 料包和叉子拿出来了；4 冲了热水；5 盖上盖子泡着；6 揭开了。
// 料包放没放（sauce、salt、veg），水里生水的比例（raw），开吃的时刻（ate），还有两个值：
//   水值（soak）：冲上水之后每分钟涨，盖不盖都一样；超过十分钟面就坨了。
//   热值（heat）：只有盖着盖子时每分钟涨，热气闷在里面面才熟；盖着够三分钟才算泡熟。
// 两个值由下面的过程每游戏分钟推进，开吃就停。数值是第一版初值，按试玩调。

import type { ActionDef, Effect } from '../core/rules';
import type { GameState } from '../core/state';
import type { ProcessDef } from '../core/world';
import { drinkBars, hotSource, vessel, w } from './water';

export const NOODLES = {
  /** 一桶面冲多少升热水。 */
  water: 0.5,
  /** 盖着泡够三分钟才熟（热值）；冲上水超过十分钟就坨了（水值）。 */
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
/** 热值：盖着泡了几分钟。水值：冲上水几分钟。 */
export const heat = (s: GameState) => n(s, 'heat');
export const soak = (s: GameState) => n(s, 'soak');
/** 0 还硬，1 正好，2 坨了。坨了就是坨了，不管熟没熟。 */
export const quality = (s: GameState) => (soak(s) > NOODLES.soggyMin ? 2 : heat(s) < NOODLES.readyMin ? 0 : 1);
export const missingPackets = (s: GameState) => PACKETS.filter((p) => !n(s, p.id)).length;
/** 按规矩泡好的一桶：料包都放了、盖着泡熟、还没坨就开吃。 */
export const doneRight = (s: GameState) => quality(s) === 1 && missingPackets(s) === 0;

/** 冲上水之后、开吃之前，面自己在泡：水值每分钟涨；盖着时热值也涨。 */
export const NOODLE_PROCESS: ProcessDef = {
  id: 'noodle',
  step: (s) => {
    if (stage(s) < 4 || n(s, 'ate')) return;
    s.things['noodle.soak'] = soak(s) + 1;
    if (stage(s) === 5) s.things['noodle.heat'] = heat(s) + 1;
  },
};

/** 从箱子里拿一桶放到桌上：之前那桶的痕迹都清掉。 */
export const NEW_CUP: Record<string, number> = {
  'noodle.stage': 1,
  'noodle.sauce': 0,
  'noodle.salt': 0,
  'noodle.veg': 0,
  'noodle.soak': 0,
  'noodle.heat': 0,
  'noodle.raw': 0,
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
        set: { 'noodle.stage': 4, 'noodle.raw': w(s, src, 'raw') },
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
    onStart: { set: { 'noodle.stage': 5 } },
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
    // 开吃那一刻定下这碗面：熟没熟、坨没坨、料包放全没有、汤里有没有生水。吃到一半走开，回来接着吃。
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

