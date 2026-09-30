import { describe, expect, it } from 'vitest';
import { createState, deserialize, serialize } from '../src/core/state';
import { applyEffect } from '../src/core/rules';
import { rand } from '../src/core/rng';
import { stepWorld } from '../src/core/world';
import { at } from '../src/core/time';

describe('状态', () => {
  it('默认第 1 天 18:00 开局，心情 lv0', () => {
    const s = createState();
    expect(s.t).toBe(at(1, 18));
    expect(s.levels.mood).toBe(0);
  });

  it('序列化往返不丢信息', () => {
    const s = createState({ seed: 42, bars: { e: 50 } });
    rand(s.rng, s.seed, 'market');
    stepWorld(s, { bars: [{ id: 'e', name: '精力', perHour: -6, initial: 50 }], actions: [], reveals: [] });
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });

  it('钱的变化一律进账本', () => {
    const s = createState();
    applyEffect(s, { money: -3 }, 1, '泡面');
    expect(s.money).toBe(-3);
    expect(s.ledger).toEqual([{ t: s.t, amount: -3, reason: '泡面', cat: 'life' }]);
  });
});

describe('随机流', () => {
  it('各流互相独立：生活多掷一次不改变行情', () => {
    const a = createState({ seed: 7 });
    const b = createState({ seed: 7 });
    rand(b.rng, b.seed, 'life');
    rand(b.rng, b.seed, 'life');
    const seqA = [0, 1, 2].map(() => rand(a.rng, a.seed, 'market'));
    const seqB = [0, 1, 2].map(() => rand(b.rng, b.seed, 'market'));
    expect(seqB).toEqual(seqA);
  });
});
