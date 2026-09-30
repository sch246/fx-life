import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { stepWorld } from '../src/core/world';
import { isVisible } from '../src/core/reveal';
import { barValue, BANDS, BODY, EFFECTS, inBand, revealBands } from '../src/data/body';
import { BARS } from '../src/data/bars';
import { CONTENT, newGame } from '../src/data';
import { debugText } from '../src/scene/debug';
import { perform } from '../src/core/world';
import { at } from '../src/core/time';

import { act, run } from './helpers';
import { stopOngoing } from '../src/core/rules';
import { roomLight } from '../src/data/room';

const barIds = new Set(BARS.map((b) => b.id));

describe('身体模型：单一事实来源', () => {
  it('后果和带都指向存在的条，阈值合法、都有一句说明', () => {
    for (const e of EFFECTS) {
      expect(barIds.has(e.bar), e.id).toBe(true);
      expect(e.perHour).not.toBe(0);
      expect(e.note.length).toBeGreaterThan(0);
    }
    for (const b of BANDS) {
      expect(barIds.has(b.bar), b.id).toBe(true);
      expect(b.at).toBeGreaterThan(0);
      expect(b.at).toBeLessThanOrEqual(100);
      expect(b.note.length).toBeGreaterThan(0);
    }
  });

  it('浮现点就是第一个后果边界：三条快变量都在 40', () => {
    for (const id of ['stamina', 'water', 'energy']) {
      const bands = revealBands(id);
      expect(bands.map((b) => b.at), id).toEqual([BODY.nourished]);
      expect(bands[0].line, id).toBeTruthy();
    }
  });

  it('开局落在"饿"带：只浮现体力一根，并写下指向泡面的那句话', () => {
    const s = newGame(1);
    stepWorld(s, CONTENT);
    expect(isVisible(s, 'bar:stamina')).toBe(true);
    expect(isVisible(s, 'bar:water')).toBe(false);
    expect(isVisible(s, 'bar:energy')).toBe(false);
    expect(s.feed.some((l) => l.text.includes('肚子饿了'))).toBe(true);
  });

  it('吃饱睡足加成只在三条都快变量 ≥40 时生效', () => {
    const s = createState({ bars: { stamina: 39, water: 50, energy: 50 } });
    const nourish = EFFECTS.find((e) => e.id === 'fitness.nourished')!;
    expect(nourish.when(s)).toBe(false);
    s.bars.stamina = 40;
    s.bars.water = 40;
    s.bars.energy = 40;
    expect(nourish.when(s)).toBe(true);
  });

  it('带的进入/离开按方向判定', () => {
    const s = createState({ bars: { stamina: 40 } });
    const hungry = BANDS.find((b) => b.id === 'stamina.hungry')!;
    expect(inBand(s, hungry)).toBe(false);
    s.bars.stamina = 39.9;
    expect(inBand(s, hungry)).toBe(true);
    expect(barValue(s, 'stamina')).toBeCloseTo(39.9);
  });

  it('正在做的事让条变化时条就浮现：第一夜精力还高，睡着时也看得见它往上涨，醒来稳定后淡出', () => {
    const s = newGame(1);
    s.t = at(1, 22);
    expect(s.bars.energy).toBeGreaterThan(BODY.nourished);
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    stepWorld(s, CONTENT);
    expect(isVisible(s, 'bar:energy')).toBe(true);
    run(s, 60);
    expect(s.ongoing?.actionId).toBe('sleep');
    expect(isVisible(s, 'bar:energy')).toBe(true);
    // 条是因为正在涨才浮现的，人并不累：「累了。」要等真的跌破 40 才说。
    expect(s.feed.some((l) => l.text === '累了。')).toBe(false);
    while (s.ongoing?.actionId === 'sleep') stepWorld(s, CONTENT);
    // 醒了还躺着，精力还在涨，条还在；起来之后稳定一阵才淡出。
    expect(s.ongoing?.actionId).toBe('lie');
    expect(isVisible(s, 'bar:energy')).toBe(true);
    stopOngoing(s);
    run(s, 40);
    expect(isVisible(s, 'bar:energy')).toBe(false);
  });

  it('白天太亮睡不着，事件流写一句；累垮了才顾不上亮，照样睡', () => {
    const s = newGame(1);
    s.t = at(2, 14);
    s.bars.energy = 60;
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    stepWorld(s, CONTENT);
    expect(s.ongoing?.actionId).toBe('lie');
    expect(s.feed.some((l) => l.text === '太亮了，睡不着。')).toBe(true);
    expect(s.feed.some((l) => l.text === '醒了。')).toBe(false);

    const worn = newGame(1);
    worn.t = at(2, 14);
    worn.bars.energy = 25;
    perform(worn, CONTENT, act('lie'));
    perform(worn, CONTENT, act('sleep'));
    run(worn, 60);
    expect(worn.ongoing?.actionId).toBe('sleep');
    expect(worn.ongoing?.occupies).toBe(true);
  });

  it('夜里开着灯太亮睡不着，关了灯才睡得着', () => {
    const s = newGame(1);
    s.t = at(1, 23);
    s.bars.energy = 60;
    perform(s, CONTENT, act('lamp-on'));
    expect(roomLight(s)).toBeGreaterThan(0.6);
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    stepWorld(s, CONTENT);
    expect(s.ongoing?.actionId).toBe('lie');
    expect(s.feed.some((l) => l.text === '太亮了，睡不着。')).toBe(true);

    perform(s, CONTENT, act('lamp-off'));
    expect(roomLight(s)).toBeLessThan(0.2);
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    run(s, 60);
    expect(s.ongoing?.actionId).toBe('sleep');
    expect(s.ongoing?.occupies).toBe(true);
  });

  it('精力见底掉一级、条回到「累了」线下硬撑；欠着觉时天亮叫不醒，睡到补满升回一级', () => {
    const s = newGame(1);
    s.t = at(2, 3);
    s.bars.energy = 0.01;
    stepWorld(s, CONTENT);
    expect(s.levels.energy).toBe(BODY.rested - 1);
    expect(s.bars.energy).toBeLessThan(BODY.nourished);
    expect(s.feed.some((l) => l.text === '熬过头了，硬撑着。')).toBe(true);

    // 夜里睡下：欠着觉，第二天早上八点太阳照进来也不醒；不欠觉的人同样的精力早就被晃醒了。
    const sleepAt = (lv: number) => {
      const x = newGame(1);
      x.t = at(2, 23);
      x.levels.energy = lv;
      x.bars.energy = 20;
      x.bars.stamina = 90; // 吃饱了睡，不会半夜饿醒
      x.bars.water = 90;
      perform(x, CONTENT, act('lie'));
      perform(x, CONTENT, act('sleep'));
      run(x, 9 * 60);
      return x;
    };
    expect(sleepAt(BODY.rested - 1).ongoing?.actionId).toBe('sleep');
    expect(sleepAt(BODY.rested).ongoing?.actionId).toBe('lie');

    // 睡到把条补满，升回一级，条从 70 接着补。
    const r = newGame(1);
    r.t = at(2, 22);
    r.levels.energy = BODY.rested - 1;
    r.bars.energy = 60;
    perform(r, CONTENT, act('lie'));
    perform(r, CONTENT, act('sleep'));
    while (r.ongoing?.actionId === 'sleep' && r.levels.energy < BODY.rested) stepWorld(r, CONTENT);
    expect(r.levels.energy).toBe(BODY.rested);
    expect(r.feed.some((l) => l.text === '觉补回来了。')).toBe(true);
  });

  it('躺着补不上精力，只让它掉得慢一点；躺着熬到见底，照样掉一级', () => {
    const s = newGame(1);
    s.t = at(1, 20);
    s.bars.energy = 60;
    perform(s, CONTENT, act('lie'));
    run(s, 120);
    expect(s.bars.energy).toBeLessThan(60);
    expect(s.bars.energy).toBeGreaterThan(60 - 8);
    s.bars.energy = 0.01;
    run(s, 2);
    expect(s.levels.energy).toBe(BODY.rested - 1);
  });

  it('等级还没掉到底时，精力见底不伤体能；掉到底还撑着才透支', () => {
    const s = newGame(1);
    s.t = at(2, 12);
    s.bars.energy = 5;
    const before = s.bars.fitness;
    run(s, 30);
    expect(s.bars.fitness).toBeGreaterThanOrEqual(before);
    s.levels.energy = 0;
    s.bars.energy = 5;
    run(s, 30);
    expect(s.bars.fitness).toBeLessThan(before);
  });

  it('调试快照每根条都列到', () => {
    const s = newGame(1);
    const txt = debugText(s, true);
    for (const b of BARS) expect(txt).toContain(b.id);
  });
});
