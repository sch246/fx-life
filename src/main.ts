import { Clock } from './core/clock';
import { perform, stepWorld } from './core/world';
import { blockedReason, objectAvailable, stopOngoing, stopTask, type ActionDef, type MenuEntry } from './core/rules';
import { CONTENT, DEMO_END_FLAG, newGame } from './data';
import { OBJECTS } from './data/objects';
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

// 暂停时可以查看，不能行动。
function begin(a: ActionDef): boolean {
  if (clock.paused || blockedReason(state, a) !== null) return false;
  clock.interrupt();
  perform(state, CONTENT, a);
  if (a.skip) clock.setFastForward(true);
  return true;
}

function stop(actionId?: string): void {
  if (clock.paused) return;
  if (actionId && state.ongoing?.actionId !== actionId) {
    // 后台的事提前收尾（例如水没开就关掉开关）：要腾得出身来，睡着时不行。
    if (state.ongoing?.occupies) return;
    clock.interrupt();
    stopTask(state, CONTENT.actions, actionId);
    return;
  }
  if (!state.ongoing) return;
  clock.interrupt();
  stopOngoing(state);
}

function choose(entry: MenuEntry): void {
  if (entry.kind === 'stop') stop();
  else begin(entry.action);
}

const scene = new Scene(document.getElementById('app')!, CONTENT, OBJECTS, {
  togglePause: () => {
    if (!endedText && started) clock.setPaused(!clock.paused);
  },
  clickObject: (id) => {
    // 点能打开来看的物件（行李箱、水壶、桌上的面、手机）：打开它（手机再点一下放下）。暂停时不打开，只能看。
    // 有菜单的物件由场景直接弹出菜单，选了才做事。
    if (clock.paused) return;
    const obj = OBJECTS.find((o) => o.id === id)!;
    const view = obj.view ?? 'menu';
    if (view !== 'menu' && objectAvailable(state, CONTENT.actions, id, !!obj.peek)) scene.openView(view, id);
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
    if (state.ongoing) stop();
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

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !endedText && started) {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
  // Esc：先合上近景，再放下没固定的手机。
  if (e.code === 'Escape') scene.closeView();
});

let last = performance.now();
function frame(now: number) {
  clock.advance((now - last) * speed);
  last = now;
  // 跳过只跳过正在做的那件事：它结束了，快进也就结束。
  if (clock.fastForward && !state.ongoing) clock.setFastForward(false);
  if (!endedText && state.flags[DEMO_END_FLAG]) {
    clock.setPaused(true);
    endedText = `现实用时 ${Math.round((now - startedAt) / 60000)} 分钟`;
  }
  scene.render(state, clock.paused, clock.fastForward, endedText, !started);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试入口：在控制台里看状态。
Object.assign(window, { __game: { state, clock } });
