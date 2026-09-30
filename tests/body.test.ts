import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { stepWorld } from '../src/core/world';
import { isVisible } from '../src/core/reveal';
import { barValue, BANDS, BODY, EFFECTS, inBand, revealBands } from '../src/data/body';
import { BARS } from '../src/data/bars';
import { CONTENT, newGame } from '../src/data';
import { debugText } from '../src/core/debug';

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

  it('调试快照每根条都列到', () => {
    const s = newGame(1);
    const txt = debugText(s, true);
    for (const b of BARS) expect(txt).toContain(b.id);
  });
});
