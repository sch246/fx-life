// 试玩节奏的模拟：用一个简单的「照顾型玩家」策略跑世界，供测试检查节奏。
import { createState, type GameState } from '../src/core/state';
import { initWorld, stepWorld } from '../src/core/world';
import { blockedReason, startAction, doing } from '../src/core/rules';
import { CONTENT } from '../src/data';
import { START_ITEMS } from '../src/data/triggers';

export function newGame(seed = 1): GameState {
  const s = createState({
    seed,
    bars: Object.fromEntries(CONTENT.bars.map((b) => [b.id, b.initial])),
    items: START_ITEMS,
  });
  initWorld(s, CONTENT);
  return s;
}

export function act(s: GameState, id: string): boolean {
  const a = CONTENT.actions.find((x) => x.id === id)!;
  if (blockedReason(s, a) !== null) return false;
  startAction(s, a, CONTENT.actions);
  return true;
}

/** 照顾型玩家：有消息就回，饿了就吃，闲着看看窗外，困了或夜深就睡。 */
export function carePolicy(s: GameState): void {
  if (s.ongoing && !doing(s, 'lie')) return;
  for (const id of ['reply-home-1', 'reply-home-2']) if (act(s, id)) return;
  if ((s.bars.hunger ?? 0) >= 55 && act(s, 'eat-noodles')) return;
  const h = Math.floor((s.t % 1440) / 60);
  if ((s.bars.energy ?? 0) < 35 || h >= 23 || h < 6) {
    act(s, 'sleep');
    return;
  }
  if (act(s, 'unpack')) return;
  if (s.t - (s.lastDone.wash ?? -1e9) >= 180 && act(s, 'wash')) return;
  if (s.t - (s.lastDone.look ?? -1e9) >= 60) act(s, 'look');
}

export function run(s: GameState, minutes: number, policy?: (s: GameState) => void, stopWhen?: (s: GameState) => boolean) {
  for (let i = 0; i < minutes; i++) {
    policy?.(s);
    stepWorld(s, CONTENT);
    if (stopWhen?.(s)) return i + 1;
  }
  return minutes;
}
