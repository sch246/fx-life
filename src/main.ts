import { Clock } from './core/clock';
import { createState } from './core/state';
import { stepWorld } from './core/world';
import { revealNow } from './core/reveal';
import { CONTENT } from './data';
import { OBJECTS } from './data/objects';
import { START_MOOD_LV } from './data/mood';
import { REVEALED_AT_START } from './data/reveals';
import { Scene } from './scene/scene';

const state = createState({
  moodLv: START_MOOD_LV,
  bars: Object.fromEntries(CONTENT.bars.map((b) => [b.id, b.initial])),
});
revealNow(state, REVEALED_AT_START);

const clock = new Clock(() => stepWorld(state, CONTENT));

const scene = new Scene(document.getElementById('app')!, CONTENT, OBJECTS, {
  togglePause: () => clock.setPaused(!clock.paused),
  clickObject: (id) => {
    // 暂停时可以查看，不能行动。
    if (clock.paused) return;
    clock.interrupt();
    void id; // 第一片接上：点物件 → 行动或选项。
  },
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    clock.setPaused(!clock.paused);
  }
});

let last = performance.now();
function frame(now: number) {
  clock.advance(now - last);
  last = now;
  scene.render(state, clock.paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试入口：在控制台里看状态。
Object.assign(window, { __game: { state, clock } });
