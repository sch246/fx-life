import { describe, expect, it } from 'vitest';
import { Clock, FAST_FORWARD_MIN_PER_SEC, MAX_MIN_PER_FRAME } from '../src/core/clock';

function counter(interruptAt = -1) {
  let n = 0;
  const clock = new Clock(() => ++n === interruptAt);
  return { clock, count: () => n };
}

describe('Clock', () => {
  it('现实 1 秒推进游戏 1 分钟，余数跨帧累积', () => {
    const { clock, count } = counter();
    clock.advance(600);
    expect(count()).toBe(0);
    clock.advance(600);
    expect(count()).toBe(1);
    clock.advance(3000);
    expect(count()).toBe(4);
  });

  it('暂停时不推进任何一分钟', () => {
    const { clock, count } = counter();
    clock.setPaused(true);
    clock.advance(10_000);
    expect(count()).toBe(0);
    clock.setPaused(false);
    clock.advance(1000);
    expect(count()).toBe(1);
  });

  it('快进只改倍率，逐分钟推进', () => {
    const { clock, count } = counter();
    clock.setFastForward(true);
    clock.advance(1000);
    expect(count()).toBe(FAST_FORWARD_MIN_PER_SEC);
  });

  it('需要注意的事打断快进，并丢弃这一帧余下的分钟', () => {
    const { clock, count } = counter(10);
    clock.setFastForward(true);
    expect(clock.advance(1000)).toBe(10);
    expect(count()).toBe(10);
    expect(clock.fastForward).toBe(false);
  });

  it('正常速度下的注意事件不影响推进', () => {
    const { clock, count } = counter(2);
    clock.advance(5000);
    expect(count()).toBe(5);
  });

  it('单帧推进有上限', () => {
    const { clock, count } = counter();
    clock.advance(10 * 60 * 60 * 1000);
    expect(count()).toBe(MAX_MIN_PER_FRAME);
  });
});
