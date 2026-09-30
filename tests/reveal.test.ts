import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { REVEAL_GAP_MIN, isVisible, stepReveal, type RevealRule } from '../src/core/reveal';

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

  it('首次浮现的新元素按焦点排队，不同时争夺注意力', () => {
    const s = createState();
    const rules: RevealRule[] = [
      { id: 'a', showWhen: () => true },
      { id: 'b', showWhen: () => true },
    ];
    tick(s, rules);
    expect([isVisible(s, 'a'), isVisible(s, 'b')]).toEqual([true, false]);
    tick(s, rules, REVEAL_GAP_MIN - 1);
    expect(isVisible(s, 'b')).toBe(false);
    tick(s, rules);
    expect(isVisible(s, 'b')).toBe(true);
  });

  it('焦点安排不是数量禁令：见过的元素再浮现、focus: false 的元素都不排队', () => {
    const s = createState();
    let hungry = false;
    const rules: RevealRule[] = [
      { id: 'a', showWhen: () => true },
      { id: 'bar:energy', showWhen: () => true, focus: false },
      { id: 'bar:hunger', showWhen: () => hungry, hideWhen: () => !hungry },
      { id: 'b', showWhen: () => true },
    ];
    s.reveal.seen['bar:hunger'] = true;
    hungry = true;
    tick(s, rules);
    expect(['a', 'bar:energy', 'bar:hunger', 'b'].map((id) => isVisible(s, id))).toEqual([true, true, true, false]);
  });

  it('返回本分钟浮现的元素', () => {
    const s = createState();
    s.t += 1;
    expect(stepReveal(s, [{ id: 'a', showWhen: () => true }, { id: 'q', showWhen: () => true, focus: false }])).toEqual([
      'q',
      'a',
    ]);
  });

  it('没有消失条件的能力一直留着；依赖可失去条件的随条件消失', () => {
    const s = createState({ moodLv: 1 });
    const rules: RevealRule[] = [
      { id: 'act:look', showWhen: (x) => x.moodLv >= 1 },
      { id: 'act:skip', showWhen: (x) => x.moodLv >= 1, hideWhen: (x) => x.moodLv < 1 },
    ];
    tick(s, rules, REVEAL_GAP_MIN + 1);
    expect([isVisible(s, 'act:look'), isVisible(s, 'act:skip')]).toEqual([true, true]);
    s.moodLv = 0;
    tick(s, rules);
    expect([isVisible(s, 'act:look'), isVisible(s, 'act:skip')]).toEqual([true, false]);
  });

  it('条件不再成立的排队项被丢弃', () => {
    const s = createState();
    let want = true;
    const rules: RevealRule[] = [
      { id: 'a', showWhen: () => true },
      { id: 'b', showWhen: () => want },
    ];
    tick(s, rules);
    want = false;
    tick(s, rules, REVEAL_GAP_MIN + 1);
    expect(isVisible(s, 'b')).toBe(false);
    expect(s.reveal.queue).toEqual([]);
  });
});
