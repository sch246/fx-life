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
import { LIGHT_WAKE_AFTER_MIN, fallAsleepMin } from '../src/data/room';
import { act, run } from './helpers';

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
    run(s, 40);
    expect(isVisible(s, 'bar:energy')).toBe(false);
  });

  it('白天小睡：睡着之后睡过一阵，亮光才把人叫醒', () => {
    const s = newGame(1);
    s.t = at(2, 14);
    s.bars.energy = 60;
    perform(s, CONTENT, act('lie'));
    perform(s, CONTENT, act('sleep'));
    let slept = 0;
    while (s.ongoing?.actionId === 'sleep' && slept < 600) {
      stepWorld(s, CONTENT);
      slept++;
    }
    expect(slept).toBeGreaterThanOrEqual(fallAsleepMin(s) + LIGHT_WAKE_AFTER_MIN);
    expect(slept).toBeLessThan(4 * 60);
  });

  it('调试快照每根条都列到', () => {
    const s = newGame(1);
    const txt = debugText(s, true);
    for (const b of BARS) expect(txt).toContain(b.id);
  });
});
