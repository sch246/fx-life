import { describe, expect, it } from 'vitest';
import { carePolicy, newGame, run } from './sim';
import { stamp } from '../src/core/time';
import { moodLv } from '../src/core/rules';

describe('第一片节奏（照顾型玩家）', () => {
  it('打印时间线', () => {
    const s = newGame();
    run(s, 24 * 60, carePolicy);
    console.log(s.feed.map((l) => `${stamp(l.t)} ${l.text}`).join('\n'));
    console.log('mood lv', moodLv(s), s.bars, s.items);
    expect(moodLv(s)).toBeGreaterThanOrEqual(1);
  });
});
