// 第一片的数值走查：用一个照顾好身体的「玩家」按正常速度过一遍，
// 检查门在合理的时间内染上颜色，以及事情发生的顺序。
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/state';
import { stepWorld } from '../src/core/world';
import { isVisible } from '../src/core/reveal';
import { blockedReason, objectAvailable, startAction, type ActionDef } from '../src/core/rules';
import { CONTENT, DEMO_END_FLAG, newGame } from '../src/data';
import { at, hourOf } from '../src/core/time';

const act = (id: string) => CONTENT.actions.find((a) => a.id === id)!;

function tryDo(s: GameState, a: ActionDef): boolean {
  if (s.ongoing || blockedReason(s, a) !== null) return false;
  startAction(s, a);
  return true;
}

/** 一个照顾身体的玩家：饿了吃、累了晚上睡、有消息就回、闲着看看窗外，门能用就出门。 */
function carefulPlayer(s: GameState): void {
  if (objectAvailable(s, CONTENT.actions, 'door')) return void tryDo(s, act('go-out'));
  const h = hourOf(s.t);
  if (s.bars.stamina < 50) {
    tryDo(s, act('take-noodles'));
    tryDo(s, act('boil-noodles'));
  }
  for (const a of CONTENT.actions) if (a.object === 'phone') tryDo(s, a);
  if (isVisible(s, 'bar:energy') && (h >= 22 || h < 5)) tryDo(s, act('sleep'));
  if (s.t % 90 === 0) tryDo(s, act('look'));
}

describe('第一片走查', () => {
  it('照顾好身体时，一天之内心情升到 lv1，门染上颜色，玩家出门', () => {
    const s = newGame(1);
    const log: string[] = [];
    let lastFeed = 0;
    while (!s.flags[DEMO_END_FLAG] && s.t < at(3, 0)) {
      carefulPlayer(s);
      stepWorld(s, CONTENT);
      if (s.t % 60 === 0) log.push(`${s.t} · 体力${s.bars.stamina.toFixed(0)} 精力${s.bars.energy.toFixed(0)} 心情lv${s.levels.mood}/${s.bars.mood.toFixed(0)} 体能lv${s.levels.fitness}/${s.bars.fitness.toFixed(0)}${isVisible(s, 'bar:mood') ? '(显)' : ''}`);
      while (lastFeed < s.feed.length) log.push(`${s.feed[lastFeed].t} ${s.feed[lastFeed++].text}`);
    }
    const hours = (s.t - at(1, 18)) / 60;
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WALK) console.log(log.map((l) => { const [t, ...r] = l.split(' '); const n = +t; return `D${Math.floor(n / 1440) + 1} ${String(Math.floor((n % 1440) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')} ${r.join(' ')}`; }).join('\n'), `\n用时 ${hours.toFixed(1)} 游戏小时`);
    expect(s.flags[DEMO_END_FLAG]).toBe(true);
    // 交接稿：整段体验不超过现实 25 分钟 = 25 游戏小时；也不应短得没经历一夜。
    expect(hours).toBeLessThanOrEqual(25);
    expect(hours).toBeGreaterThanOrEqual(12);
    expect(s.flags['replied:arrived']).toBe(true);
  });

  it('心情 lv0 时门是灰的；睡眠跳过没有浮现', () => {
    const s = newGame(1);
    expect(objectAvailable(s, CONTENT.actions, 'door')).toBe(false);
    expect(isVisible(s, 'act:sleep-skip')).toBe(false);
  });

  it('什么都不做会饿坏，心情往下掉，透支让体能降级', () => {
    const s = newGame(1);
    for (let i = 0; i < 24 * 60; i++) stepWorld(s, CONTENT);
    expect(s.levels.mood ?? 0).toBe(0);
    expect(s.bars.stamina).toBeLessThan(15);
    expect(s.levels.fitness).toBeLessThan(2);
  });

  it('睡着时只有床能用，其他物件变灰', () => {
    const s = newGame(1);
    startAction(s, act('sleep'));
    expect(objectAvailable(s, CONTENT.actions, 'bed')).toBe(true);
    expect(objectAvailable(s, CONTENT.actions, 'window')).toBe(false);
    expect(objectAvailable(s, CONTENT.actions, 'bag', true)).toBe(false);
    expect(objectAvailable(s, CONTENT.actions, 'phone', true)).toBe(false);
  });

  it('水壶要先从箱子里拿出一桶面才能用', () => {
    const s = newGame(1);
    expect(objectAvailable(s, CONTENT.actions, 'kettle')).toBe(false);
    startAction(s, act('take-noodles'));
    expect(objectAvailable(s, CONTENT.actions, 'kettle')).toBe(true);
    expect(objectAvailable(s, CONTENT.actions, 'bag')).toBe(false);
  });
});
