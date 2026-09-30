import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { objectAvailable, type ActionDef } from '../src/core/rules';

const ACTIONS: ActionDef[] = [
  { id: 'go-out', object: 'door', label: '出门', temper: 'discipline' },
  { id: 'eat', object: 'bag', label: '吃泡面', temper: 'impulse', requires: (s) => (s.items.noodles ?? 0) > 0 },
];

describe('物件可用', () => {
  it('需要自律的行动在心情最低时被挡住，物件变灰；心情回升后上色', () => {
    const s = createState({ moodLv: 0 });
    expect(objectAvailable(s, ACTIONS, 'door')).toBe(false);
    s.levels.mood = 1;
    expect(objectAvailable(s, ACTIONS, 'door')).toBe(true);
  });

  it('前提不满足时变灰', () => {
    const s = createState({ items: { noodles: 1 } });
    expect(objectAvailable(s, ACTIONS, 'bag')).toBe(true);
    s.items.noodles = 0;
    expect(objectAvailable(s, ACTIONS, 'bag')).toBe(false);
  });
});
