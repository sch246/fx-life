import { Clock } from './core/clock';
import { stepWorld } from './core/world';
import { isVisible } from './core/reveal';
import { blockedReason, objectAvailable, objectMenu, startAction, stopOngoing, type ActionDef, type MenuEntry } from './core/rules';
import { CONTENT, DEMO_END_FLAG, newGame } from './data';
import { OBJECTS } from './data/objects';
import { Scene } from './scene/scene';

// 试玩调试用：?speed=10 让时间走快 10 倍。正式体验不带参数。
const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;

const state = newGame();
const clock = new Clock(() => stepWorld(state, CONTENT));
const startedAt = performance.now();
let endedText: string | null = null;

// 有显隐规则的动作要浮现后才列出；没有规则的一直列出。
const gated = new Set(CONTENT.reveals.map((r) => r.id));
const actionVisible = (id: string) => !gated.has(`act:${id}`) || isVisible(state, `act:${id}`);

function begin(a: ActionDef): void {
  if (clock.paused || blockedReason(state, a) !== null) return;
  clock.interrupt();
  startAction(state, a);
  if (a.skip) clock.setFastForward(true);
}

function choose(entry: MenuEntry): void {
  if (clock.paused || !entry.enabled) return;
  if (entry.kind === 'stop') {
    clock.interrupt();
    stopOngoing(state);
    return;
  }
  begin(entry.action);
}

const scene = new Scene(document.getElementById('app')!, CONTENT, OBJECTS, {
  togglePause: () => {
    if (!endedText) clock.setPaused(!clock.paused);
  },
  clickObject: (id) => {
    // 暂停时可以查看，不能行动。点物件只是打开它，不直接替玩家做事。
    if (clock.paused) return;
    const obj = OBJECTS.find((o) => o.id === id)!;
    const view = obj.view ?? 'menu';
    if (view !== 'menu') {
      if (objectAvailable(state, CONTENT.actions, id, true)) scene.openView(view, id);
      return;
    }
    scene.closeView();
    scene.showMenu(id, objectMenu(state, CONTENT.actions, id, actionVisible));
  },
  chooseEntry: choose,
  doAction: (id) => {
    const a = CONTENT.actions.find((x) => x.id === id);
    if (!a) return;
    begin(a);
    // 在近景里开始一件要花时间的事（整理行李），就合上近景去做。
    const view = OBJECTS.find((o) => o.id === a.object)?.view;
    if (view === 'closeup' && state.ongoing?.actionId === a.id) scene.closeView();
  },
  restart: () => location.reload(),
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !endedText) {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
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
  scene.render(state, clock.paused, clock.fastForward, endedText);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试入口：在控制台里看状态。
Object.assign(window, { __game: { state, clock } });
