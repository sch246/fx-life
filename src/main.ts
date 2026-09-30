import { Clock } from './core/clock';
import { perform, stepWorld } from './core/world';
import { blockedReason, endOngoing, objectAvailable, stopOngoing, stopTask, type ActionDef, type MenuEntry } from './core/rules';
import { CONTENT, DEMO_END_FLAG, newGame } from './data';
import { OBJECTS } from './data/objects';
import { CARRIED } from './data/items';
import { debugEnabled, debugText } from './scene/debug';
import { Scene } from './scene/scene';

// 试玩调试用：?speed=10 让时间走快 10 倍。正式体验不带参数。
const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;

const state = newGame();
const clock = new Clock(() => stepWorld(state, CONTENT));
let startedAt = performance.now();
let endedText: string | null = null;
// 开局先挑这个人的样子；挑的时候时间不走。
let started = false;
clock.setPaused(true);
/** 正在跳过的那件事（睡到醒）：它一结束，快进就结束。 */
let skipping: string | null = null;

// 暂停时可以查看，不能行动。
function begin(a: ActionDef): boolean {
  if (clock.paused || blockedReason(state, a) !== null) return false;
  clock.interrupt();
  perform(state, CONTENT, a);
  if (a.skip) {
    clock.setFastForward(true);
    skipping = a.id;
  }
  return true;
}

/**
 * 停下一件事。正在做的这件：只停它自己，回到它下面那件（睁眼，还躺着）。
 * 它下面那件（起来）：连同上面的一起停。都不是：后台的事，提前收尾。
 */
function stop(actionId?: string): void {
  if (clock.paused) return;
  const cur = state.ongoing ? CONTENT.actions.find((a) => a.id === state.ongoing!.actionId) : undefined;
  if (!actionId || actionId === cur?.id) {
    if (!cur) return;
    clock.interrupt();
    return endOngoing(state, CONTENT.actions);
  }
  if (cur?.on === actionId) {
    clock.interrupt();
    return stopOngoing(state);
  }
  // 后台的事提前收尾（例如水没开就关掉开关）：要腾得出身来，睡着时不行。
  if (state.ongoing?.occupies) return;
  clock.interrupt();
  stopTask(state, CONTENT.actions, actionId);
}

function choose(entry: MenuEntry): void {
  if (entry.kind === 'stop') stop(entry.action.id);
  else begin(entry.action);
}

const scene = new Scene(document.getElementById('app')!, CONTENT, OBJECTS, {
  togglePause: () => {
    if (!endedText && started) clock.setPaused(!clock.paused);
  },
  clickObject: (id) => {
    // 点能打开来看的物件（行李箱、水壶、桌上的面）：打开它。暂停时不打开，只能看。
    // 有菜单的物件由场景直接弹出菜单，选了才做事。
    if (clock.paused) return;
    const obj = OBJECTS.find((o) => o.id === id)!;
    const view = obj.view ?? 'menu';
    if (view !== 'menu' && objectAvailable(state, CONTENT.actions, id, !!obj.peek)) scene.openView(view, id);
  },
  openItem: (id) => {
    // 身上带的东西（手机）：点一下拿出来，再点一下放回去。暂停时不拿，睡着时拿不出来。
    const item = CARRIED.find((c) => c.id === id);
    if (clock.paused || !item) return;
    if (objectAvailable(state, CONTENT.actions, id, true)) scene.openView(item.view, id);
  },
  chooseEntry: choose,
  doAction: (id) => {
    const a = CONTENT.actions.find((x) => x.id === id);
    if (!a || !begin(a)) return false;
    // 在近景里开始一件要花一阵子的事（吃面、整理行李），或者让小人自动去做，就合上近景去做。
    if (state.ongoing?.actionId === a.id && ((a.minutes ?? 0) > 1 || a.auto)) scene.closeView();
    return true;
  },
  stop,
  walk: () => {
    // 起身走开会停下正在做的事（躺着、看窗外……）；睡着时走不了。
    if (clock.paused || state.ongoing?.occupies) return false;
    if (state.ongoing) {
      clock.interrupt();
      stopOngoing(state);
    }
    return true;
  },
  restart: () => location.reload(),
  choosePerson: (part, id) => {
    if (!started) state.person[part] = id;
  },
  start: () => {
    if (started) return;
    started = true;
    startedAt = performance.now();
    clock.setPaused(false);
  },
});

// 调试面板：?debug 打开，或按 ` 随时开关。只读状态，不进入游戏逻辑。
const debugEl = document.createElement('pre');
debugEl.className = 'debug-panel';
debugEl.hidden = !debugEnabled();
document.body.appendChild(debugEl);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !endedText && started) {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
  // Esc：先合上近景，再放下没固定的手机。
  if (e.code === 'Escape') scene.closeView();
  if (e.code === 'Backquote') debugEl.hidden = !debugEl.hidden;
});

let last = performance.now();
function frame(now: number) {
  clock.advance((now - last) * speed);
  last = now;
  // 跳过只跳过正在做的那件事：它结束了，快进也就结束。
  if (clock.fastForward && state.ongoing?.actionId !== skipping) clock.setFastForward(false);
  if (!endedText && state.flags[DEMO_END_FLAG]) {
    clock.setPaused(true);
    endedText = `现实用时 ${Math.round((now - startedAt) / 60000)} 分钟`;
  }
  scene.render(state, clock.paused, clock.fastForward, endedText, !started);
  if (!debugEl.hidden) debugEl.textContent = debugText(state, clock.paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试入口：在控制台里看状态。
Object.assign(window, { __game: { state, clock } });
