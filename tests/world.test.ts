import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { stepWorld, type Content } from '../src/core/world';

const content = (interrupts?: boolean): Content => ({
  bars: [],
  actions: [],
  reveals: [{ id: 'obj:phone', showWhen: () => true, focus: false, interrupts }],
});

describe('世界推进', () => {
  it('浮现本身不打断快进', () => {
    expect(stepWorld(createState(), content())).toBe(false);
  });

  it('规则声明 interrupts 时打断快进', () => {
    expect(stepWorld(createState(), content(true))).toBe(true);
  });
});
