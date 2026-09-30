import { Clock } from './core/clock';
import { createState } from './core/state';
import { stepWorld } from './core/world';
import { revealNow, isVisible } from './core/reveal';
import { objectMenu, startAction, stopOngoing, stepCues, type MenuEntry } from './core/rules';
import { CONTENT, DEMO_END_FLAG } from './data';
import { OBJECTS } from './data/objects';
import { START_MOOD_LV } from './data/mood';
import { START_ITEMS } from './data/cues';
import { REVEALED_AT_START } from './data/reveals';
import { Scene } from './scene/scene';

// 试玩调试用：?speed=10 让时间走快 10 倍。正式体验不带参数。
const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;

const state = createState({
  levels: { mood: START_MOOD_LV },
  bars: Object.fromEntries(CONTENT.bars.map((b) => [b.id, b.initial])),
  items: START_ITEMS,
});
revealNow(state, REVEALED_AT_START);
stepCues(state, CONTENT.cues ?? []);

const clock = new Clock(() => stepWorld(state, CONTENT));
const startedAt = performance.now();
let endedText: string | null = null;

// 有显隐规则的动作要浮现后才列出；没有规则的一直列出。
const gated = new Set(CONTENT.reveals.map((r) => r.id));
const actionVisible = (id: string) => !gated.has(`act:${id}`) || isVisible(state, `act:${id}`);

function choose(entry: MenuEntry): void {
  if (clock.paused || !entry.enabled) return;
  clock.interrupt();
  if (entry.kind === 'stop') {
    stopOngoing(state);
    return;
  }
  startAction(state, entry.action);
  if (entry.action.skip) clock.setFastForward(true);
}

const scene = new Scene(document.getElementById('app')!, CONTENT, OBJECTS, {
  togglePause: () => {
    if (!endedText) clock.setPaused(!clock.paused);
  },
  clickObject: (id) => {
    // 暂停时可以查看，不能行动。
    if (clock.paused) return;
    const entries = objectMenu(state, CONTENT.actions, id, actionVisible);
    // 日常行动点一次；需要选的点两次。
    if (entries.length === 1 && entries[0].enabled) choose(entries[0]);
    else if (entries.length > 0) scene.showMenu(id, entries);
  },
  chooseEntry: choose,
  restart: () => location.reload(),
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !endedText) {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
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
