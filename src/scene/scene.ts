// 场景：房间、窗户、角色、物件、状态条、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。

import type { GameState } from '../core/state';
import type { Content } from '../core/world';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { objectAvailable } from '../core/rules';
import { stamp, hm } from '../core/time';
import { skyColor, lightsOn } from './sky';

export interface SceneIntents {
  togglePause(): void;
  clickObject(id: string): void;
}

const FAR_WINDOWS = 18;

export class Scene {
  private readonly room: HTMLElement;
  private readonly win: HTMLElement;
  private readonly winTime: HTMLElement;
  private readonly farLights: HTMLElement[] = [];
  private readonly objs = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, { el: HTMLElement; fill: HTMLElement }>();
  private readonly feed: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private feedCount = 0;
  private readonly content: Content;

  constructor(
    root: HTMLElement,
    content: Content,
    objects: readonly ObjectDef[],
    intents: SceneIntents,
  ) {
    root.innerHTML = `
      <main class="stage">
        <button class="pause" type="button" aria-label="暂停"></button>
        <section class="room" aria-label="房间">
          <div class="window"><div class="sky"></div><div class="far"></div><span class="win-time"></span></div>
          <div class="character" aria-label="角色"></div>
        </section>
        <section class="bars" aria-label="状态"></section>
        <ol class="feed" aria-live="polite"></ol>
      </main>`;
    this.content = content;
    this.room = root.querySelector('.room')!;
    this.win = root.querySelector('.window .sky')!;
    this.winTime = root.querySelector('.win-time')!;
    this.feed = root.querySelector('.feed')!;
    this.pauseBtn = root.querySelector('.pause')!;
    this.pauseBtn.addEventListener('click', () => intents.togglePause());

    const far = root.querySelector('.far')!;
    for (let i = 0; i < FAR_WINDOWS; i++) {
      const d = document.createElement('i');
      far.appendChild(d);
      this.farLights.push(d);
    }

    for (const o of objects) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'obj';
      el.dataset.id = o.id;
      el.textContent = o.name;
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` });
      el.addEventListener('click', () => intents.clickObject(o.id));
      this.room.appendChild(el);
      this.objs.set(o.id, el);
    }

    const barsEl = root.querySelector('.bars')!;
    for (const b of content.bars) {
      const el = document.createElement('div');
      el.className = 'bar';
      el.innerHTML = `<span class="bar-name">${b.name}</span><span class="bar-track"><span class="bar-fill"></span></span>`;
      barsEl.appendChild(el);
      this.bars.set(b.id, { el, fill: el.querySelector('.bar-fill')! });
    }
  }

  render(s: GameState, paused: boolean): void {
    this.win.style.background = skyColor(s.t);
    this.winTime.textContent = hm(s.t);
    const on = lightsOn(s.t);
    // 固定顺序逐盏点亮，避免每帧闪烁。
    this.farLights.forEach((d, i) => d.classList.toggle('lit', (i * 7) % FAR_WINDOWS < on * FAR_WINDOWS));

    // 物件始终在场：能用时上色，不能用时灰。
    for (const [id, el] of this.objs) el.classList.toggle('available', objectAvailable(s, this.content.actions, id));
    for (const [id, b] of this.bars) {
      b.el.classList.toggle('shown', isVisible(s, `bar:${id}`));
      b.fill.style.width = `${s.bars[id] ?? 0}%`;
    }

    this.pauseBtn.textContent = paused ? '继续' : '暂停';
    this.room.classList.toggle('paused', paused);

    while (this.feedCount < s.feed.length) {
      const line = s.feed[this.feedCount++];
      const li = document.createElement('li');
      li.innerHTML = `<time>${stamp(line.t)}</time> `;
      li.append(line.text);
      this.feed.prepend(li);
    }
  }
}
