// 场景：房间、窗户、角色、物件、状态条、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。

import type { GameState } from '../core/state';
import type { BarDef, Content } from '../core/world';
import type { ActionDef, Effect } from '../core/rules';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { blockedReason, freshness, moodLv, objectAvailable } from '../core/rules';
import { canSkip } from '../core/world';
import { stamp, hm } from '../core/time';
import { MOOD_LEVELS } from '../data/mood';
import { roomLight } from '../data/room';
import { skyColor, lightsOn } from './sky';

export interface SceneIntents {
  togglePause(): void;
  doAction(id: string): void;
  stop(): void;
  skip(): void;
  stopSkip(): void;
  restart(): void;
}

export interface SceneView {
  paused: boolean;
  fastForward: boolean;
}

export interface SceneData {
  content: Content;
  objects: readonly ObjectDef[];
  itemNames: Record<string, string>;
}

const FAR_WINDOWS = 18;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Scene {
  private readonly root: HTMLElement;
  private readonly room: HTMLElement;
  private readonly sky: HTMLElement;
  private readonly dark: HTMLElement;
  private readonly winTime: HTMLElement;
  private readonly farLights: HTMLElement[] = [];
  private readonly objs = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, { el: HTMLElement; track: HTMLElement; fill: HTMLElement }>();
  private readonly char: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly sheet: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly ending: HTMLElement;
  private feedCount = 0;
  private openObject: string | null = null;
  private panelOpen = false;
  private menuKey = '';
  private bubbleKey = '';
  private panelKey = '';

  constructor(
    root: HTMLElement,
    private readonly data: SceneData,
    private readonly intents: SceneIntents,
  ) {
    this.root = root;
    root.innerHTML = `
      <main class="stage">
        <section class="room" aria-label="房间">
          <div class="dark"></div>
          <div class="character" aria-label="角色" role="button" tabindex="0"><i class="head"></i><i class="body"></i><span class="zz">z z</span></div>
          <div class="bubble"></div>
          <button class="pause" type="button"></button>
        </section>
        <section class="bars" aria-label="状态"></section>
        <ol class="feed" aria-live="polite"></ol>
        <div class="sheet" hidden></div>
        <div class="panel" hidden></div>
        <div class="ending" hidden></div>
      </main>`;
    this.room = root.querySelector('.room')!;
    this.dark = root.querySelector('.dark')!;
    this.char = root.querySelector('.character')!;
    this.bubble = root.querySelector('.bubble')!;
    this.feed = root.querySelector('.feed')!;
    this.pauseBtn = root.querySelector('.pause')!;
    this.sheet = root.querySelector('.sheet')!;
    this.panel = root.querySelector('.panel')!;
    this.ending = root.querySelector('.ending')!;
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      intents.togglePause();
    });

    for (const o of data.objects) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `obj obj-${o.id}`;
      el.dataset.id = o.id;
      el.setAttribute('aria-label', o.name);
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` });
      if (o.id === 'window') {
        el.innerHTML = `<span class="sky"></span><span class="far"></span><span class="frame"></span><span class="win-time"></span>`;
      } else {
        el.innerHTML = `<span class="art"></span><span class="obj-name">${esc(o.name)}</span>`;
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openObject = this.openObject === o.id ? null : o.id;
        this.panelOpen = false;
        this.menuKey = '';
      });
      this.room.insertBefore(el, this.dark);
      this.objs.set(o.id, el);
    }
    this.sky = root.querySelector('.obj-window .sky')!;
    this.winTime = root.querySelector('.win-time')!;
    const far = root.querySelector('.obj-window .far')!;
    for (let i = 0; i < FAR_WINDOWS; i++) {
      const d = document.createElement('i');
      far.appendChild(d);
      this.farLights.push(d);
    }

    const barsEl = root.querySelector('.bars')!;
    for (const b of data.content.bars) {
      const el = document.createElement('div');
      el.className = `bar bar-${b.id}`;
      el.innerHTML = `<span class="bar-name">${esc(b.name)}</span><span class="bar-track"><span class="bar-fill"></span></span>`;
      barsEl.appendChild(el);
      this.bars.set(b.id, { el, track: el.querySelector('.bar-track')!, fill: el.querySelector('.bar-fill')! });
    }

    this.char.addEventListener('click', (e) => {
      e.stopPropagation();
      this.panelOpen = !this.panelOpen;
      this.openObject = null;
      this.panelKey = '';
    });
    this.sheet.addEventListener('click', (e) => this.onSheetClick(e));
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest('button');
      if (t?.dataset.do === 'skip') intents.skip();
      if (t?.dataset.do === 'stop-skip') intents.stopSkip();
    });
    this.ending.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-do=restart]')) intents.restart();
    });
    document.addEventListener('click', () => {
      this.openObject = null;
      this.panelOpen = false;
    });
  }

  private onSheetClick(e: Event): void {
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act) this.intents.doAction(btn.dataset.act);
    else if (btn.dataset.do === 'stop') this.intents.stop();
    this.openObject = null;
  }

  private onPanelClick(e: Event): void {
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest('button');
    if (btn?.dataset.do === 'restart' && confirm('从头开始？当前进度会清掉。')) this.intents.restart();
    if (btn?.dataset.do === 'close') this.panelOpen = false;
  }

  closeMenus(): void {
    this.openObject = null;
    this.panelOpen = false;
  }

  render(s: GameState, v: SceneView): void {
    const c = this.data.content;
    this.sky.style.background = skyColor(s.t);
    this.winTime.textContent = hm(s.t);
    const on = lightsOn(s.t);
    // 固定顺序逐盏点亮，避免每帧闪烁。
    this.farLights.forEach((d, i) => d.classList.toggle('lit', (i * 7) % FAR_WINDOWS < on * FAR_WINDOWS));
    this.dark.style.opacity = String(0.55 * (1 - roomLight(s.t)));

    // 物件始终在场：能用时上色，不能用时灰。
    for (const [id, el] of this.objs) {
      el.classList.toggle('available', objectAvailable(s, c.actions, id));
      el.classList.toggle('open', this.openObject === id);
    }

    // 条
    const lv = moodLv(s);
    const ml = MOOD_LEVELS[lv];
    for (const [id, b] of this.bars) {
      b.el.classList.toggle('shown', isVisible(s, `bar:${id}`));
      b.fill.style.width = `${s.bars[id] ?? 0}%`;
      if (id === 'mood') {
        b.track.style.height = `${ml.thickness}px`;
        b.fill.style.background = ml.color;
      }
    }

    // 角色
    const ongoing = s.ongoing ? c.actions.find((a) => a.id === s.ongoing!.actionId) : undefined;
    const at = this.data.objects.find((o) => o.id === ongoing?.object);
    const spot = at?.spot ?? { x: 44, y: 46 };
    const lying = ongoing?.object === 'bed';
    this.char.style.left = `${spot.x}%`;
    this.char.style.top = `${lying ? 58 : spot.y}%`;
    this.char.classList.toggle('lying', lying);
    this.char.classList.toggle('asleep', ongoing?.id === 'sleep');
    this.char.style.setProperty('--tone', ml.color);

    // 角色头上的小气泡：正在做什么；能跳过时有跳过。
    const skippable = canSkip(s, c);
    const bkey = `${ongoing?.id ?? ''}|${skippable}|${v.fastForward}|${v.paused}`;
    if (bkey !== this.bubbleKey) {
      this.bubbleKey = bkey;
      let html = '';
      if (ongoing) {
        html = `<span>${esc(ongoing.label)}中</span>`;
        if (v.fastForward) html += `<button type="button" data-do="stop-skip">跳过中 · 停</button>`;
        else if (skippable && !v.paused) html += `<button type="button" data-do="skip">跳过</button>`;
      }
      this.bubble.innerHTML = html;
      this.bubble.hidden = !html;
    }
    this.bubble.style.left = `${spot.x}%`;
    this.bubble.style.top = `${(lying ? 58 : spot.y) - 10}%`;

    this.pauseBtn.textContent = v.paused ? '继续' : '暂停';
    this.room.classList.toggle('paused', v.paused);
    this.room.classList.toggle('ff', v.fastForward);

    this.renderSheet(s, v);
    this.renderPanel(s);

    while (this.feedCount < s.feed.length) {
      const line = s.feed[this.feedCount++];
      const li = document.createElement('li');
      li.innerHTML = `<time>${stamp(line.t)}</time> `;
      li.append(line.text);
      this.feed.prepend(li);
    }
  }

  /** 点物件后的选项：只列出发现过的动作；被规则挡住的是灰的，并写明为什么。 */
  private renderSheet(s: GameState, v: SceneView): void {
    const c = this.data.content;
    const id = this.openObject;
    if (!id) {
      this.sheet.hidden = true;
      this.menuKey = '';
      return;
    }
    const obj = this.data.objects.find((o) => o.id === id)!;
    const rows: string[] = [];
    const ongoingHere = s.ongoing && c.actions.find((a) => a.id === s.ongoing!.actionId)?.object === id;
    for (const a of c.actions) {
      if (a.object !== id) continue;
      const why = blockedReason(s, a);
      // 依赖心情的能力，心情不够时就不在；前提暂时不满足的，发现过就留着（灰）。
      if (why === 'mood') continue;
      if (why === 'requires' && !s.reveal.seen[`act:${a.id}`]) continue;
      if (s.ongoing?.actionId === a.id) continue;
      const disabled = v.paused || why !== null;
      const note = v.paused ? '暂停中' : why === 'requires' ? (a.blockedText ?? '') : '';
      rows.push(
        `<button type="button" class="opt" data-act="${a.id}" ${disabled ? 'disabled' : ''}>
          <b>${esc(a.label)}</b><span class="cost">${this.preview(s, a)}</span>${note ? `<em>${esc(note)}</em>` : ''}
        </button>`,
      );
    }
    if (ongoingHere) {
      const cur = c.actions.find((a) => a.id === s.ongoing!.actionId)!;
      rows.unshift(
        `<button type="button" class="opt" data-do="stop" ${v.paused ? 'disabled' : ''}><b>${cur.id === 'sleep' ? '醒来' : '停下'}</b><span class="cost">${esc(cur.label)}中</span></button>`,
      );
    }
    const key = `${id}|${rows.join('')}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    if (!rows.length) {
      // 灰的物件：没有能做的事，不弹菜单，只轻轻晃一下。
      const el = this.objs.get(id)!;
      el.classList.remove('nudge');
      void el.offsetWidth;
      el.classList.add('nudge');
      this.openObject = null;
      this.sheet.hidden = true;
      return;
    }
    this.sheet.innerHTML = `<h3>${esc(obj.name)}</h3>${rows.join('')}`;
    this.sheet.hidden = false;
  }

  /** 行动预览：时间，以及它影响到的条（即使那根条当前是隐藏的）。 */
  private preview(s: GameState, a: ActionDef): string {
    const parts: string[] = [];
    parts.push(a.minutes ? `${a.minutes} 分钟` : a.until ? '到自然醒' : '随时可停');
    const fresh = freshness(s, a);
    const seen = new Set<string>();
    const add = (e: Effect | undefined, scaled: boolean) => {
      if (!e) return;
      for (const [id, dv] of Object.entries(e.bars ?? {})) {
        if (seen.has(id) || !dv) continue;
        seen.add(id);
        const name = this.data.content.bars.find((b: BarDef) => b.id === id)?.name ?? id;
        const k = dv > 0 && scaled ? fresh : 1;
        const arrow = k === 0 ? '·' : dv > 0 ? '↑' : '↓';
        parts.push(`<span style="opacity:${0.35 + 0.65 * k}">${esc(name)} ${arrow}</span>`);
      }
      for (const [id, dv] of Object.entries(e.items ?? {})) {
        const name = this.data.itemNames[id];
        if (name) parts.push(`${esc(name)} ${dv > 0 ? '+' : ''}${dv}`);
      }
    };
    add(a.onStart, true);
    add(a.perHour, false);
    add(a.onEnd, true);
    return parts.join(' · ');
  }

  /** 点角色：完整状态。 */
  private renderPanel(s: GameState): void {
    if (!this.panelOpen) {
      this.panel.hidden = true;
      this.panelKey = '';
      return;
    }
    const lv = moodLv(s);
    const rows = this.data.content.bars
      .map((b) => {
        const val = Math.round(s.bars[b.id] ?? 0);
        const style = b.levels ? `height:${MOOD_LEVELS[lv].thickness}px` : '';
        const fill = b.levels ? `background:${MOOD_LEVELS[lv].color}` : '';
        return `<div class="prow"><span>${esc(b.name)}</span><span class="bar-track" style="${style}"><span class="bar-fill" style="width:${val}%;${fill}"></span></span></div>`;
      })
      .join('');
    const items = Object.entries(s.items)
      .filter(([id, n]) => this.data.itemNames[id] && n > 0)
      .map(([id, n]) => `${esc(this.data.itemNames[id])} × ${n}`)
      .join('　');
    const html = `<h3>${stamp(s.t)}</h3>${rows}<p class="items">${items || '　'}</p>
      <div class="panel-foot"><button type="button" data-do="restart">从头开始</button><button type="button" data-do="close">关上</button></div>`;
    if (html === this.panelKey) return;
    this.panelKey = html;
    this.panel.innerHTML = html;
    this.panel.hidden = false;
  }

  showEnding(s: GameState, startT: number, realMs: number): void {
    const gameMin = s.t - startT;
    const realMin = Math.max(1, Math.round(realMs / 60000));
    this.ending.innerHTML = `
      <div class="ending-card">
        <p>${stamp(s.t)}，出了门。</p>
        <p class="dim">在房间里过了 ${Math.floor(gameMin / 60)} 小时 ${gameMin % 60} 分钟。现实里约 ${realMin} 分钟。</p>
        <p class="dim">这一版到这里为止。</p>
        <button type="button" data-do="restart">从头再来</button>
      </div>`;
    this.ending.hidden = false;
    this.root.querySelector('.stage')!.classList.add('ended');
  }
}
