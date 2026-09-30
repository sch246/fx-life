// 原型人生：同一套世界，不同的作息/照顾方式。用来观察代价是否成立、有没有死带。
// 不是断言"哪种人生更好"，只是让数值可观察：调完一个数，跑一遍就知道曲线变了没有。
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/state';
import { stepWorld } from '../src/core/world';
import { at, hourOf } from '../src/core/time';
import { BANDS, inBand } from '../src/data/body';
import { CONTENT, newGame } from '../src/data';
import { carefulPlayer } from './helpers';

const WALK = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WALK;
const DAY = 24 * 60;

interface Wake {
  t: number;
  energy: number;
}

/** 跑一段，记录每次睡醒的时刻和精力。 */
function run(s: GameState, min: number, policy: (s: GameState) => void): Wake[] {
  const wakes: Wake[] = [];
  for (let i = 0; i < min; i++) {
    policy(s);
    const before = s.ongoing?.actionId;
    stepWorld(s, CONTENT);
    const after = s.ongoing?.actionId;
    const was = before === 'sleep' || before === 'sleep-skip';
    const is = after === 'sleep' || after === 'sleep-skip';
    if (was && !is) wakes.push({ t: s.t, energy: s.bars.energy });
  }
  return wakes;
}

const wakeLine = (w: Wake) =>
  `D${Math.floor(w.t / DAY) + 1} ${String(hourOf(w.t)).padStart(2, '0')}:${String(w.t % 60).padStart(2, '0')} 精力${Math.round(w.energy)}`;

describe('原型人生', () => {
  it('同样的照顾，晚睡的人醒来精力更低', () => {
    // 面管够：这一条只对照作息，不让"吃完了"成为第三个变量。
    const early = newGame(1);
    early.t = at(1, 18);
    early.items.noodles = 999;
    const earlyWakes = run(early, 3 * DAY, (s) => carefulPlayer(s, { sleepFrom: 22, goOut: false }));

    const late = newGame(1);
    late.t = at(1, 18);
    late.items.noodles = 999;
    const lateWakes = run(late, 3 * DAY, (s) => carefulPlayer(s, { sleepFrom: 2, goOut: false }));

    expect(earlyWakes.length).toBeGreaterThan(0);
    expect(lateWakes.length).toBeGreaterThan(0);
    if (WALK) {
      console.log('早睡(22):', earlyWakes.map(wakeLine).join(' | '));
      console.log('晚睡(02):', lateWakes.map(wakeLine).join(' | '));
    }
    // 早睡每次满电醒来；晚睡至少有一次是带着亏空醒的。
    expect(Math.min(...earlyWakes.map((w) => w.energy))).toBeGreaterThan(99);
    expect(Math.min(...lateWakes.map((w) => w.energy))).toBeLessThan(95);
    // 都在早上才醒。
    for (const w of [...earlyWakes, ...lateWakes]) expect(hourOf(w.t)).toBeGreaterThanOrEqual(5);
  });

  it('通宵一夜：第二天熬过头掉等级；之后照常 22 点睡，几天内缓过来，体能没有垮', () => {
    const s = newGame(1);
    s.t = at(1, 18);
    s.items.noodles = 999;
    // 第 2 天 18:00 到第 3 天中午不睡，其余 22 点睡（sleepFrom 5 表示不到点）。
    const policy = (x: GameState) =>
      carefulPlayer(x, { sleepFrom: x.t >= at(2, 18) && x.t < at(3, 12) ? 5 : 22, goOut: false });
    const lows: number[] = [];
    for (let i = 0; i < 6 * DAY; i++) {
      policy(s);
      stepWorld(s, CONTENT);
      lows.push(s.levels.energy);
      if (s.t === at(3, 12)) {
        // 通宵后的第二天：一定没精神，已经掉过一级。
        expect(s.levels.energy).toBeLessThan(3);
        expect(s.bars.energy).toBeLessThan(40);
      }
    }
    if (WALK) console.log('通宵后精力等级最低到', Math.min(...lows));
    expect(Math.min(...lows)).toBeGreaterThanOrEqual(1);
    expect(s.levels.energy).toBe(3);
    expect(s.levels.fitness).toBeGreaterThanOrEqual(2);
  });

  it('带的观测：对照"照顾好"和"什么都不管"，看哪些带真的被进入过', () => {
    const seen = new Set<string>();
    const observe = (s: GameState, min: number, policy: (s: GameState) => void) => {
      for (let i = 0; i < min; i++) {
        policy(s);
        stepWorld(s, CONTENT);
        for (const b of BANDS) if (inBand(s, b)) seen.add(b.id);
      }
    };
    const care = newGame(1);
    care.t = at(1, 18);
    care.items.noodles = 999;
    observe(care, 3 * DAY, (s) => carefulPlayer(s, { goOut: false }));
    const slacker = newGame(1);
    slacker.t = at(1, 18);
    observe(slacker, DAY, () => {}); // 什么都不做：把低端带都走一遍
    if (WALK) console.log('进入过的带:', [...seen].sort().join(', '));
    // 这些带在首片里必须真的能进入，否则就是死带。
    for (const id of ['stamina.hungry', 'stamina.burnout', 'water.mood', 'energy.burnout', 'fitness.low']) {
      expect(seen.has(id), id).toBe(true);
    }
  });

  it('跑三天，各根条始终在 0–100、没有 NaN', () => {
    const s = newGame(3);
    s.t = at(1, 18);
    run(s, 3 * DAY, (x) => carefulPlayer(x, { goOut: false }));
    for (const [id, v] of Object.entries(s.bars)) {
      expect(Number.isFinite(v), id).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
