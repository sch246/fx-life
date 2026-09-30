// 第一片的数值走查：用一个照顾好身体的「玩家」按正常速度过一遍，
// 检查门在合理的时间内染上颜色，以及事情发生的顺序。
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/state';
import { stepWorld } from '../src/core/world';
import { isVisible } from '../src/core/reveal';
import { blockedReason, objectAvailable, startAction, type ActionDef } from '../src/core/rules';
import { perform } from '../src/core/world';
import { dispenserWater, k, kettleHot, soakedFor, soaking } from '../src/data/kettle';
import { CONTENT, DEMO_END_FLAG, newGame } from '../src/data';
import { at, hourOf } from '../src/core/time';

const act = (id: string) => CONTENT.actions.find((a) => a.id === id)!;

function tryDo(s: GameState, a: ActionDef): boolean {
  if (s.ongoing || blockedReason(s, a) !== null) return false;
  perform(s, CONTENT, a);
  return true;
}

/** 一个照顾身体的玩家：饿了自己烧水泡面、渴了喝水、晚上睡、有消息就回、闲着看看窗外，门能用就出门。 */
function carefulPlayer(s: GameState): void {
  if (objectAvailable(s, CONTENT.actions, 'door')) return void tryDo(s, act('go-out'));
  const h = hourOf(s.t);
  const hungry = s.bars.stamina < 50;
  const thirsty = s.bars.water < 50;
  if (soaking(s) && soakedFor(s) >= 4) tryDo(s, act('open-noodles'));
  if (hungry && !(s.items.cup ?? 0) && !soaking(s)) tryDo(s, act('take-noodles'));
  const needHot = (s.items.cup ?? 0) > 0 || (thirsty && dispenserWater(s) < 0.25);
  if (needHot && k(s, 'water') < 0.5 && !k(s, 'on')) tryDo(s, act('fill-kettle'));
  if (needHot && !kettleHot(s) && !k(s, 'on')) tryDo(s, act('kettle-on'));
  if (k(s, 'on') && k(s, 'temp') >= 100) tryDo(s, act('kettle-off'));
  if ((s.items.cup ?? 0) > 0 && kettleHot(s)) tryDo(s, act('pour-cup'));
  if (!(s.items.cup ?? 0) && dispenserWater(s) < 0.25 && k(s, 'water') > 0 && !k(s, 'on')) tryDo(s, act('pour-dispenser'));
  if (thirsty) tryDo(s, act('drink'));
  for (const a of CONTENT.actions) if (a.object === 'phone') tryDo(s, a);
  if (isVisible(s, 'bar:energy') && (h >= 22 || h < 5) && !soaking(s) && !k(s, 'on')) tryDo(s, act('sleep'));
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
      if (s.t % 60 === 0) log.push(`${s.t} · 体力${s.bars.stamina.toFixed(0)} 精力${s.bars.energy.toFixed(0)} 水分${s.bars.water.toFixed(0)} 心情lv${s.levels.mood}/${s.bars.mood.toFixed(0)} 体能lv${s.levels.fitness}/${s.bars.fitness.toFixed(0)}${isVisible(s, 'bar:mood') ? '(显)' : ''}`);
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

  it('水壶：5 分钟烧开，开着不关 30 分钟烧干，再干烧 5 分钟烧坏', () => {
    const s = newGame(1);
    perform(s, CONTENT, act('fill-kettle'));
    s.ongoing = null;
    perform(s, CONTENT, act('kettle-on'));
    for (let i = 0; i < 5; i++) stepWorld(s, CONTENT);
    expect(k(s, 'temp')).toBe(100);
    for (let i = 0; i < 30; i++) stepWorld(s, CONTENT);
    expect(k(s, 'water')).toBeCloseTo(0);
    expect(k(s, 'broken')).toBe(0);
    for (let i = 0; i < 5; i++) stepWorld(s, CONTENT);
    expect(k(s, 'broken')).toBe(1);
    expect(blockedReason(s, act('kettle-on'))).not.toBeNull();
  });

  it('关掉后 30 分钟水就不够烫了', () => {
    const s = newGame(1);
    perform(s, CONTENT, act('fill-kettle'));
    s.ongoing = null;
    perform(s, CONTENT, act('kettle-on'));
    for (let i = 0; i < 5; i++) stepWorld(s, CONTENT);
    perform(s, CONTENT, act('kettle-off'));
    expect(s.accum['skill:boil']).toBe(1);
    for (let i = 0; i < 29; i++) stepWorld(s, CONTENT);
    expect(kettleHot(s)).toBe(true);
    for (let i = 0; i < 2; i++) stepWorld(s, CONTENT);
    expect(kettleHot(s)).toBe(false);
  });

  it('泡面：三分钟前揭开是硬的，三到十分钟正好，超过十分钟坨了；泡好两次学会自动', () => {
    const cook = (wait: number) => {
      const s = newGame(1);
      s.things['kettle.water'] = 1.5;
      s.things['kettle.temp'] = 100;
      perform(s, CONTENT, act('take-noodles'));
      perform(s, CONTENT, act('pour-cup'));
      for (let i = 0; i < wait; i++) stepWorld(s, CONTENT);
      perform(s, CONTENT, act('open-noodles'));
      return s;
    };
    expect(cook(2).feed.at(-1)!.text).toBe('面还有点硬。');
    expect(cook(5).feed.at(-1)!.text).toBe('面泡得正好。');
    expect(cook(12).feed.at(-1)!.text).toBe('面坨了。');
    const s = cook(5);
    expect(isVisible(s, 'act:auto-noodles')).toBe(false);
    s.accum['skill:soak'] = 2;
    stepWorld(s, CONTENT);
    expect(isVisible(s, 'act:auto-noodles')).toBe(true);
  });

  it('手动做事略微加心情，同一件事一小时内只算一次', () => {
    const s = newGame(1);
    const m0 = s.bars.mood;
    perform(s, CONTENT, act('kettle-on'));
    perform(s, CONTENT, act('kettle-off'));
    perform(s, CONTENT, act('kettle-on'));
    expect(s.bars.mood - m0).toBeCloseTo(2);
  });
});
