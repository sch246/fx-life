import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { isVisible, stepReveal, type RevealRule } from '../src/core/reveal';

const tick = (s: ReturnType<typeof createState>, rules: RevealRule[], n = 1) => {
  for (let i = 0; i < n; i++) {
    s.t += 1;
    stepReveal(s, rules);
  }
};

describe('显隐', () => {
  it('条件满足时浮现，首次写一行话，再次浮现不重复', () => {
    const s = createState({ bars: { e: 100 } });
    const rules: RevealRule[] = [
      { id: 'bar:e', showWhen: (x) => x.bars.e < 90, hideWhen: (x) => x.bars.e >= 95, holdMinutes: 10, firstLine: '有点累。' },
    ];
    tick(s, rules);
    expect(isVisible(s, 'bar:e')).toBe(false);
    s.bars.e = 80;
    tick(s, rules);
    expect(isVisible(s, 'bar:e')).toBe(true);
    expect(s.feed.map((l) => l.text)).toEqual(['有点累。']);

    s.bars.e = 100;
    tick(s, rules, 30);
    expect(isVisible(s, 'bar:e')).toBe(false);
    s.bars.e = 80;
    tick(s, rules);
    expect(isVisible(s, 'bar:e')).toBe(true);
    expect(s.feed).toHaveLength(1);
  });

  it('迟滞：消失条件要连续成立 holdMinutes 才消失', () => {
    const s = createState({ bars: { e: 80 } });
    const rules: RevealRule[] = [
      { id: 'bar:e', showWhen: (x) => x.bars.e < 90, hideWhen: (x) => x.bars.e >= 95, holdMinutes: 10 },
    ];
    tick(s, rules);
    s.bars.e = 96;
    tick(s, rules, 5);
    s.bars.e = 92; // 在 90 和 95 之间：既不浮现也不开始计时
    tick(s, rules);
    s.bars.e = 96;
    tick(s, rules, 9);
    expect(isVisible(s, 'bar:e')).toBe(true);
    tick(s, rules, 2);
    expect(isVisible(s, 'bar:e')).toBe(false);
  });

  it('没有焦点队列：同时满足条件的元素同时浮现', () => {
    const s = createState();
    const rules: RevealRule[] = [
      { id: 'a', showWhen: () => true },
      { id: 'b', showWhen: () => true },
    ];
    tick(s, rules);
    expect([isVisible(s, 'a'), isVisible(s, 'b')]).toEqual([true, true]);
  });

  it('没有消失条件的能力一直留着；依赖可失去条件的随条件消失', () => {
    const s = createState({ moodLv: 1 });
    const rules: RevealRule[] = [
      { id: 'act:look', showWhen: (x) => x.levels.mood >= 1 },
      { id: 'act:skip', showWhen: (x) => x.levels.mood >= 1, hideWhen: (x) => x.levels.mood < 1 },
    ];
    tick(s, rules);
    expect([isVisible(s, 'act:look'), isVisible(s, 'act:skip')]).toEqual([true, true]);
    s.levels.mood = 0;
    tick(s, rules);
    expect([isVisible(s, 'act:look'), isVisible(s, 'act:skip')]).toEqual([true, false]);
  });
});
