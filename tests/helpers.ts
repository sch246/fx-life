// 测试用的"原型玩家"和推进工具。slice1 的数值走查、archetypes 的对照都从这一份拿，
// 保证脚本玩家只有一份，调游戏数值时不会两边漂移。
import type { ActionDef } from '../src/core/rules';
import type { GameState } from '../src/core/state';
import { blockedReason, keepsCurrent, objectAvailable } from '../src/core/rules';
import { perform, stepWorld } from '../src/core/world';
import { hourOf } from '../src/core/time';
import { CONTENT } from '../src/data';
import { heat, NOODLES, stage } from '../src/data/noodles';
import { dispenserWater, hotSource, k, w } from '../src/data/water';

export const act = (id: string) => CONTENT.actions.find((a) => a.id === id)!;
export const lyingDown = (s: GameState) => s.ongoing?.actionId === 'lie';
export const run = (s: GameState, min: number) => {
  for (let i = 0; i < min; i++) stepWorld(s, CONTENT);
};

export function tryDo(s: GameState, a: ActionDef): boolean {
  if ((s.ongoing && !keepsCurrent(a)) || blockedReason(s, a) !== null) return false;
  perform(s, CONTENT, a);
  return true;
}

/** 是不是该睡了：from>=6 表示晚上（比如 22），<6 表示凌晨（比如 2）。 */
const bedtime = (h: number, from: number) => (from >= 6 ? h >= from || h < 5 : h >= from && h < 5);

export interface CareOptions {
  /** 几点开始睡：22=晚上十点，2=凌晨两点。 */
  sleepFrom?: number;
  /** 心情到 lv1、门能用时要不要出门结束演示。 */
  goOut?: boolean;
}

/** 一个照顾身体的玩家：饿了一步步泡面、渴了喝烧开过的水、到点睡、有消息就回、闲着看看窗外。 */
export function carefulPlayer(s: GameState, opts: CareOptions = {}): void {
  const { sleepFrom = 22, goOut = true } = opts;
  if (goOut && objectAvailable(s, CONTENT.actions, 'door')) return void tryDo(s, act('go-out'));
  for (const a of CONTENT.actions) if (a.object === 'phone') tryDo(s, a);
  if (s.ongoing && s.ongoing.actionId !== 'lie') return;
  const h = hourOf(s.t);
  const hungry = s.bars.stamina < 50;
  const thirsty = s.bars.water < 50;
  const st = stage(s);
  if (st === 6) tryDo(s, act('noodle-eat'));
  if (st === 5 && heat(s) >= 4) tryDo(s, act('noodle-open'));
  if (st === 4) tryDo(s, act('noodle-cover'));
  if (st === 3 || st === 4) for (const p of ['sauce', 'salt', 'veg']) tryDo(s, act(`noodle-${p}`));
  const src = hotSource(s, NOODLES.water);
  if (st === 3 && src && w(s, src.id, 'raw') === 0) tryDo(s, act('noodle-pour'));
  if (st === 2) tryDo(s, act('noodle-unpack'));
  if (st === 1) tryDo(s, act('noodle-tear'));
  if (hungry && st === 0) tryDo(s, act('take-noodles'));
  if (s.ongoing) return;
  const wantCup = stage(s) >= 1 && stage(s) <= 3;
  const wantDrink = thirsty && dispenserWater(s) < 0.25;
  if ((wantCup || wantDrink) && !(src && w(s, src.id, 'raw') === 0) && !k(s, 'on')) {
    if (k(s, 'water') < 0.5 || k(s, 'raw') > 0 || k(s, 'temp') < 90) {
      if (k(s, 'water') < 1.4) return void tryDo(s, act('fill-kettle'));
      tryDo(s, act('kettle-on'));
    }
  }
  if (k(s, 'on') && k(s, 'temp') >= 100) tryDo(s, act('kettle-off'));
  if (!wantCup && dispenserWater(s) < 0.25 && k(s, 'water') > 0 && !k(s, 'on') && k(s, 'raw') === 0) tryDo(s, act('pour-dispenser'));
  if (thirsty && w(s, 'dispenser', 'raw') === 0) tryDo(s, act('drink'));
  // 到点就睡，和状态条显不显示无关：脚本玩家不该依赖 UI 的浮现。
  if (bedtime(h, sleepFrom) && stage(s) === 0 && !k(s, 'on')) {
    tryDo(s, act('lie'));
    if (lyingDown(s)) perform(s, CONTENT, act('sleep'));
  }
  if (s.t % 90 === 0) tryDo(s, act('look'));
}
