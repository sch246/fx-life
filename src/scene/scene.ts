// 场景：房间、窗户、角色、物件、状态条、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。

import type { GameState } from '../core/state';
import type { Content } from '../core/world';
import type { MenuEntry } from '../core/rules';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { barPreview, objectAvailable } from '../core/rules';
import { stamp, hm } from '../core/time';
import { MOOD_LEVELS } from '../data/mood';
import { ITEM_NAMES } from '../data/items';
import { skyColor, lightsOn } from './sky';

export interface SceneIntents {
  togglePause(): void;
  clickObject(id: string): void;
  chooseEntry(entry: MenuEntry): void;
  restart(): void;
}

const FAR_WINDOWS = 18;

export class Scene {
  private readonly room: HTMLElement;
  private readonly win: HTMLElement;
  private readonly winTime: HTMLElement;
  private readonly character: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly status: HTMLElement;
  private readonly end: HTMLElement;
  private readonly ff: HTMLElement;
  private readonly farLights: HTMLElement[] = [];
  private readonly objs = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, { el: HTMLElement; fill: HTMLElement; track: HTMLElement }>();
  private readonly feed: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly content: Content;
  private feedCount = 0;
  private statusOpen = false;

  constructor(
    root: HTMLElement,
    content: Content,
    objects: readonly ObjectDef[],
    private readonly intents: SceneIntents,
  ) {
    this.content = content;
    root.innerHTML = `
      <main class="stage">
        <div class="top">
          <span class="ff" aria-live="polite"></span>
          <button class="pause" type="button"></button>
        </div>
        <section class="room" aria-label="房间">
          <div class="window"><div class="sky"></div><div class="far"></div><span class="win-time"></span></div>
          <button class="character" type="button" aria-label="角色"></button>
          <div class="menu" role="menu" hidden></div>
          <div class="status" hidden></div>
          <div class="end" hidden>
            <p>第一片的试玩到这里结束。</p>
            <p class="end-time"></p>
            <button type="button" class="restart">重新开始</button>
          </div>
        </section>
        <section class="bars" aria-label="状态"></section>
        <ol class="feed" aria-live="polite"></ol>
      </main>`;
    this.room = root.querySelector('.room')!;
    this.win = root.querySelector('.window .sky')!;
    this.winTime = root.querySelector('.win-time')!;
    this.character = root.querySelector('.character')!;
    this.menu = root.querySelector('.menu')!;
    this.status = root.querySelector('.status')!;
    this.end = root.querySelector('.end')!;
    this.ff = root.querySelector('.ff')!;
    this.feed = root.querySelector('.feed')!;
    this.pauseBtn = root.querySelector('.pause')!;
    this.pauseBtn.addEventListener('click', () => intents.togglePause());
    this.character.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideMenu();
      this.statusOpen = !this.statusOpen;
    });
    root.querySelector('.restart')!.addEventListener('click', () => intents.restart());
    this.room.addEventListener('click', () => {
      this.hideMenu();
      this.statusOpen = false;
    });

    const far = root.querySelector('.far')!;
    for (let i = 0; i < FAR_WINDOWS; i++) {
      const d = document.createElement('i');
      far.appendChild(d);
      this.farLights.push(d);
    }

    for (const o of objects) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `obj obj-${o.id}`;
      el.dataset.id = o.id;
      el.innerHTML = `<span class="obj-name">${o.name}</span>`;
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.statusOpen = false;
        intents.clickObject(o.id);
      });
      this.room.insertBefore(el, this.character);
      this.objs.set(o.id, el);
    }

    const barsEl = root.querySelector('.bars')!;
    for (const b of content.bars) {
      const el = document.createElement('div');
      el.className = `bar bar-${b.id}`;
      el.innerHTML = `<span class="bar-name">${b.name}</span><span class="bar-track"><span class="bar-fill"></span></span>`;
      barsEl.appendChild(el);
      this.bars.set(b.id, { el, fill: el.querySelector('.bar-fill')!, track: el.querySelector('.bar-track')! });
    }
  }

  showMenu(objectId: string, entries: readonly MenuEntry[]): void {
    const anchor = this.objs.get(objectId);
    if (!anchor) return;
    const names = new Map(this.content.bars.map((b) => [b.id, b.name]));
    this.menu.innerHTML = '';
    for (const entry of entries) {
      const a = entry.action;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !entry.enabled;
      const label = entry.kind === 'stop' ? a.stopLabel! : a.label;
      const preview =
        entry.kind === 'stop'
          ? ''
          : [
              ...Object.entries(barPreview(a)).map(([id, d]) => `${names.get(id) ?? id}${d > 0 ? '↑' : '↓'}`),
              a.minutes ? `${a.minutes} 分钟` : '',
            ]
              .filter(Boolean)
              .join(' ');
      btn.innerHTML = `<span>${label}</span><small>${preview}</small>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideMenu();
        this.intents.chooseEntry(entry);
      });
      this.menu.appendChild(btn);
    }
    const r = anchor.getBoundingClientRect();
    const box = this.room.getBoundingClientRect();
    const left = Math.min(Math.max(0, r.left - box.left), box.width - 170);
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${Math.max(0, r.top - box.top - 8)}px`;
    this.menu.hidden = false;
  }

  hideMenu(): void {
    this.menu.hidden = true;
  }

  render(s: GameState, paused: boolean, fastForward: boolean, ended: string | null): void {
    this.win.style.background = skyColor(s.t);
    this.winTime.textContent = hm(s.t);
    const on = lightsOn(s.t);
    // 固定顺序逐盏点亮，避免每帧闪烁。
    this.farLights.forEach((d, i) => d.classList.toggle('lit', (i * 7) % FAR_WINDOWS < on * FAR_WINDOWS));

    // 物件始终在场：能用时上色，不能用时灰。
    for (const [id, el] of this.objs) el.classList.toggle('available', objectAvailable(s, this.content.actions, id));

    const cur = s.ongoing && this.content.actions.find((a) => a.id === s.ongoing!.actionId);
    this.character.dataset.pose = cur?.pose ?? '';

    const mood = MOOD_LEVELS[s.levels.mood ?? 0] ?? MOOD_LEVELS[0];
    for (const [id, b] of this.bars) {
      b.el.classList.toggle('shown', isVisible(s, `bar:${id}`));
      b.fill.style.width = `${s.bars[id] ?? 0}%`;
      if (id === 'mood') {
        b.track.style.height = `${mood.thickness}px`;
        b.fill.style.background = mood.color;
      }
    }

    this.status.hidden = !this.statusOpen;
    if (this.statusOpen) {
      const rows = this.content.bars.map((b) => {
        const lv = b.levels ? (s.levels[b.id] ?? 0) : null;
        const style = b.id === 'mood' ? `height:${mood.thickness}px;background:${mood.color}` : '';
        return `<div class="srow"><span>${b.name}</span><span class="bar-track"><span class="bar-fill" style="width:${s.bars[b.id] ?? 0}%;${style}"></span></span>${lv === null ? '' : ''}</div>`;
      });
      const items = Object.entries(s.items)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${ITEM_NAMES[id] ?? id} ×${n}`);
      this.status.innerHTML = `<div class="stime">${stamp(s.t)}</div>${rows.join('')}${items.length ? `<div class="sitems">${items.join('　')}</div>` : ''}`;
    }

    this.pauseBtn.textContent = paused ? '继续' : '暂停';
    this.room.classList.toggle('paused', paused && !ended);
    this.ff.textContent = fastForward ? '»» 睡着' : '';

    this.end.hidden = !ended;
    if (ended) this.end.querySelector('.end-time')!.textContent = ended;

    while (this.feedCount < s.feed.length) {
      const line = s.feed[this.feedCount++];
      const li = document.createElement('li');
      li.innerHTML = `<time>${stamp(line.t)}</time> `;
      li.append(line.text);
      this.feed.prepend(li);
    }
  }
}
