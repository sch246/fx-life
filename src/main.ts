import { Clock } from './core/clock';
import { createState, deserialize, serialize, type GameState } from './core/state';
import { canSkip, initWorld, stepWorld } from './core/world';
import { revealNow } from './core/reveal';
import { blockedReason, startAction, stopOngoing } from './core/rules';
import { say } from './core/feed';
import { CONTENT } from './data';
import { OBJECTS } from './data/objects';
import { START_MOOD_LV } from './data/mood';
import { REVEALED_AT_START } from './data/reveals';
import { DEMO_END_ACTIONS, ITEM_NAMES } from './data/actions';
import { START_ITEMS, START_LINE } from './data/triggers';
import { Scene } from './scene/scene';

const SAVE_KEY = 'fx-life-slice1';

interface Save {
  state: string;
  startT: number;
  realMs: number;
  ended: boolean;
}

function newGame(): GameState {
  const s = createState({
    moodLv: START_MOOD_LV,
    bars: Object.fromEntries(CONTENT.bars.map((b) => [b.id, b.initial])),
    items: START_ITEMS,
  });
  revealNow(s, REVEALED_AT_START);
  initWorld(s, CONTENT);
  say(s, START_LINE);
  return s;
}

function load(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const sv = JSON.parse(raw) as Save;
    deserialize(sv.state);
    return sv;
  } catch {
    return null;
  }
}

const saved = load();
const state: GameState = saved && !saved.ended ? deserialize(saved.state) : newGame();
const startT = saved && !saved.ended ? saved.startT : state.t;
let realMs = saved && !saved.ended ? saved.realMs : 0;
let ended = false;

function save(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state: serialize(state), startT, realMs, ended } satisfies Save));
  } catch {
    /* 无痕模式等存不了时照常玩 */
  }
}

// 快进只在「正在做的事可以跳过」时继续；跳过的条件一失去（醒了、心情掉回去），快进就停。
const clock = new Clock(() => stepWorld(state, CONTENT) || !canSkip(state, CONTENT));
// 读档后从暂停开始，玩家点「继续」再走。
if (saved && !saved.ended) clock.setPaused(true);

const scene = new Scene(
  document.getElementById('app')!,
  { content: CONTENT, objects: OBJECTS, itemNames: ITEM_NAMES },
  {
    togglePause: () => clock.setPaused(!clock.paused),
    doAction: (id) => {
      // 暂停时可以查看，不能行动。
      if (clock.paused || ended) return;
      const a = CONTENT.actions.find((x) => x.id === id);
      if (!a || blockedReason(state, a) !== null) return;
      clock.interrupt();
      startAction(state, a, CONTENT.actions);
      if (DEMO_END_ACTIONS.includes(a.id)) {
        ended = true;
        clock.setPaused(true);
        save();
        scene.render(state, { paused: false, fastForward: false });
        scene.showEnding(state, startT, realMs);
      }
    },
    stop: () => {
      if (clock.paused || ended) return;
      clock.interrupt();
      stopOngoing(state, CONTENT.actions);
    },
    skip: () => {
      if (!clock.paused && canSkip(state, CONTENT)) clock.setFastForward(true);
    },
    stopSkip: () => clock.interrupt(),
    restart: () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* 忽略 */
      }
      location.reload();
    },
  },
);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !ended) {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
});

// 离开页面（切走、锁屏）时暂停：时钟不在玩家看不见时补算时间。
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!ended) clock.setPaused(true);
    save();
  }
});
setInterval(() => !ended && save(), 5000);

let last = performance.now();
function frame(now: number) {
  // 单帧最多算 250 毫秒，避免后台回来时一次推进太多。
  const dt = Math.min(250, now - last);
  last = now;
  if (!ended) {
    if (!clock.paused) realMs += dt;
    clock.advance(dt);
  }
  scene.render(state, { paused: clock.paused && !ended, fastForward: clock.fastForward });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试入口：在控制台里看状态。
Object.assign(window, {
  __game: { state, clock },
});
