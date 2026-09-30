// 场景：房间、窗户、角色、物件、状态条、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。
// 点物件只是打开它：弹出能做的事（menu），凑近看（closeup），或者在右侧打开屏幕（screen）。

import type { GameState } from '../core/state';
import type { BarDef, Content } from '../core/world';
import type { ActionDef, MenuEntry } from '../core/rules';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { barPreview, blockedReason, objectAvailable } from '../core/rules';
import { daylight, stamp, hm } from '../core/time';
import { ITEM_NAMES } from '../data/items';
import { MESSAGES } from '../data/messages';
import { DISPENSER, KETTLE, k, soaking } from '../data/kettle';
import { CityView } from './window';

export interface SceneIntents {
  togglePause(): void;
  clickObject(id: string): void;
  chooseEntry(entry: MenuEntry): void;
  /** 在近景或屏幕里点了某件事。 */
  doAction(actionId: string): void;
  restart(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function levelStyle(b: BarDef, s: GameState) {
  const st = b.levels?.styles;
  if (!st) return null;
  return st[Math.min(st.length - 1, s.levels[b.id] ?? 0)];
}

export class Scene {
  private readonly room: HTMLElement;
  private readonly winTime: HTMLElement;
  private readonly city: CityView;
  private readonly dim: HTMLElement;
  private readonly sunPatch: HTMLElement;
  private readonly character: HTMLElement;
  private readonly heldCup: HTMLElement;
  private readonly soakCup: HTMLElement;
  private readonly kettleFx: HTMLElement;
  private readonly dispWater: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly status: HTMLElement;
  private readonly closeup: HTMLElement;
  private readonly phone: HTMLElement;
  private readonly end: HTMLElement;
  private readonly ff: HTMLElement;
  private readonly objs = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, { el: HTMLElement; fill: HTMLElement; track: HTMLElement }>();
  private readonly feed: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly actions: Map<string, ActionDef>;
  private feedCount = 0;
  private statusOpen = false;
  private view: { kind: 'closeup' | 'screen'; id: string } | null = null;
  private phoneApp: 'home' | 'chat' = 'home';
  private lastViewKey = '';

  constructor(
    root: HTMLElement,
    private readonly content: Content,
    private readonly objects: readonly ObjectDef[],
    private readonly intents: SceneIntents,
  ) {
    this.actions = new Map(content.actions.map((a) => [a.id, a]));
    root.innerHTML = `
      <main class="stage">
        <div class="top">
          <span class="ff" aria-live="polite"></span>
          <button class="pause" type="button"></button>
        </div>
        <section class="room" aria-label="房间">
          <div class="wall"></div>
          <div class="floor"></div>
          <div class="sun-patch"></div>
          <div class="window"><canvas class="city"></canvas><span class="win-time"></span></div>
          <div class="held-cup" hidden></div>
          <div class="soak-cup" hidden><i class="steam"></i></div>
          <div class="kettle-fx"><i class="glow"></i><i class="steam"></i></div>
          <div class="disp-water"></div>
          <button class="character" type="button" aria-label="角色"><i class="head"></i><i class="body"></i></button>
          <div class="dim"></div>
          <div class="menu" role="menu" hidden></div>
          <div class="status" hidden></div>
          <div class="closeup" hidden></div>
          <div class="phone-screen" hidden></div>
          <div class="end" hidden>
            <p>第一片的试玩到这里结束。</p>
            <p class="end-time"></p>
            <button type="button" class="restart">重新开始</button>
          </div>
        </section>
        <section class="bars" aria-label="状态"></section>
        <ol class="feed" aria-live="polite"></ol>
      </main>`;
    const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
    this.room = $('.room');
    this.winTime = $('.win-time');
    this.city = new CityView($('.city'));
    this.dim = $('.dim');
    this.sunPatch = $('.sun-patch');
    this.character = $('.character');
    this.heldCup = $('.held-cup');
    this.soakCup = $('.soak-cup');
    this.kettleFx = $('.kettle-fx');
    this.dispWater = $('.disp-water');
    this.menu = $('.menu');
    this.status = $('.status');
    this.closeup = $('.closeup');
    this.phone = $('.phone-screen');
    this.end = $('.end');
    this.ff = $('.ff');
    this.feed = $('.feed');
    this.pauseBtn = $('.pause');
    this.pauseBtn.addEventListener('click', () => intents.togglePause());
    this.character.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideMenu();
      this.statusOpen = !this.statusOpen;
    });
    $('.restart').addEventListener('click', () => intents.restart());
    this.room.addEventListener('click', () => {
      this.hideMenu();
      this.statusOpen = false;
    });
    for (const el of [this.menu, this.status, this.closeup, this.phone]) el.addEventListener('click', (e) => e.stopPropagation());

    // 近景和屏幕里的点击都走事件委托：data-act 做事，data-nav 切换界面，data-close 关掉。
    for (const el of [this.closeup, this.phone]) {
      el.addEventListener('click', (e) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-nav],[data-close]');
        if (!t || (t as HTMLButtonElement).disabled) return;
        if (t.dataset.close !== undefined) this.closeView();
        else if (t.dataset.nav) {
          this.phoneApp = t.dataset.nav as 'home' | 'chat';
          this.lastViewKey = '';
        } else if (t.dataset.act) {
          intents.doAction(t.dataset.act);
          this.lastViewKey = '';
        }
      });
    }

    for (const o of objects) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `obj obj-${o.id}`;
      el.dataset.id = o.id;
      el.setAttribute('aria-label', o.name);
      el.innerHTML = `<span class="obj-name">${o.name}</span>`;
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.statusOpen = false;
        this.hideMenu();
        intents.clickObject(o.id);
      });
      this.room.insertBefore(el, this.character);
      this.objs.set(o.id, el);
    }

    const barsEl = $('.bars');
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
    if (!anchor || entries.length === 0) return;
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
      btn.innerHTML = `<span>${esc(label)}</span><small>${preview}</small>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideMenu();
        this.intents.chooseEntry(entry);
      });
      this.menu.appendChild(btn);
    }
    const r = anchor.getBoundingClientRect();
    const box = this.room.getBoundingClientRect();
    const left = Math.min(Math.max(4, r.left - box.left), box.width - 180);
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${Math.max(90, r.top - box.top - 6)}px`;
    this.menu.hidden = false;
  }

  hideMenu(): void {
    this.menu.hidden = true;
  }

  openView(kind: 'closeup' | 'screen', id: string): void {
    this.view = { kind, id };
    this.phoneApp = 'home';
    this.lastViewKey = '';
  }

  closeView(): void {
    this.view = null;
    this.lastViewKey = '';
  }

  private canDo(s: GameState, id: string): boolean {
    const a = this.actions.get(id);
    return !!a && blockedReason(s, a) === null;
  }

  private shown(s: GameState, id: string): boolean {
    const gated = this.content.reveals.some((r) => r.id === `act:${id}`);
    return !gated || isVisible(s, `act:${id}`);
  }

  private renderCloseup(s: GameState): void {
    if (this.view?.id === 'kettle') return this.renderKettle(s);
    const n = s.items.noodles ?? 0;
    const take = this.canDo(s, 'take-noodles');
    const key = `bag|${n}|${take}|${this.shown(s, 'unpack')}|${this.canDo(s, 'unpack')}|${s.items.cup ?? 0}`;
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;
    const cups = Array.from(
      { length: n },
      (_, i) =>
        `<button type="button" class="cup" data-act="take-noodles" ${take ? '' : 'disabled'} aria-label="桶面" style="--i:${i}"><i></i></button>`,
    ).join('');
    const clothes = this.shown(s, 'unpack')
      ? `<button type="button" class="clothes" data-act="unpack" ${this.canDo(s, 'unpack') ? '' : 'disabled'}><span>整理行李</span></button>`
      : `<div class="clothes"></div>`;
    const hint = (s.items.cup ?? 0) > 0 ? '<p class="cu-note">拿出来的面放在水壶旁边。</p>' : '';
    this.closeup.innerHTML = `
      <div class="case">
        <div class="lid"><div class="lining"></div></div>
        <div class="base">${clothes}<div class="cups">${cups}</div></div>
      </div>
      ${hint}
      <button type="button" class="cu-close" data-close>合上箱子</button>`;
  }

  /** 水壶近景：左边是水壶（水位、红晕、气泡、白气），右边是能做的事。 */
  private renderKettle(s: GameState): void {
    const acts = this.content.actions.filter((a) => a.object === 'kettle' && this.shown(s, a.id));
    const key = `kettle|${acts.map((a) => `${a.id}:${this.canDo(s, a.id)}`).join()}`;
    if (key !== this.lastViewKey) {
      this.lastViewKey = key;
      const btns = acts
        .map((a) => `<button type="button" class="kv-btn${a.auto ? ' auto' : ''}" data-act="${a.id}" ${this.canDo(s, a.id) ? '' : 'disabled'}>${esc(a.label)}</button>`)
        .join('');
      this.closeup.innerHTML = `
        <div class="kv">
          <div class="kv-kettle"><div class="kv-body"><i class="kv-water"></i><i class="kv-glow"></i><i class="kv-bubbles"></i></div><i class="kv-lid"></i><i class="kv-handle"></i><i class="kv-spout"></i><i class="kv-led"></i><i class="kv-steam"></i></div>
          <div class="kv-side">${btns}<button type="button" class="cu-close" data-close>走开</button></div>
        </div>`;
    }
    // 水位、温度、开关这些每分钟都在变，直接改样式，不重建按钮。
    const el = this.closeup.querySelector<HTMLElement>('.kv-kettle');
    if (!el) return;
    const temp = k(s, 'temp');
    const on = !!k(s, 'on');
    el.style.setProperty('--level', String(k(s, 'water') / KETTLE.capacity));
    el.style.setProperty('--heat', String(Math.max(0, (temp - 55) / 45)));
    el.classList.toggle('on', on);
    el.classList.toggle('bubbling', on && k(s, 'water') > 0 && temp >= 80);
    el.classList.toggle('steaming', k(s, 'water') > 0 && temp >= 95);
    el.classList.toggle('broken', !!k(s, 'broken'));
  }

  private renderPhone(s: GameState): void {
    const arrived = MESSAGES.filter((m) => s.flags[`msg:${m.id}`]);
    const unread = arrived.filter((m) => !s.flags[`replied:${m.id}`]).length;
    const key = `phone|${this.phoneApp}|${arrived.length}|${unread}|${arrived.map((m) => this.canDo(s, `reply-${m.id}`)).join()}`;
    const clock = this.phone.querySelector('.ph-time');
    if (key === this.lastViewKey) {
      if (clock) clock.textContent = hm(s.t);
      return;
    }
    this.lastViewKey = key;
    const bar = `<div class="ph-bar"><span class="ph-time">${hm(s.t)}</span><span>▮▮▮ ▭</span></div>`;
    let body: string;
    if (this.phoneApp === 'home') {
      body = `<div class="ph-home">
          <button type="button" class="ph-app" data-nav="chat"><i class="ph-icon msg">${unread ? `<b>${unread}</b>` : ''}</i><span>消息</span></button>
        </div>`;
    } else {
      const bubbles = arrived
        .map(
          (m) =>
            `<p class="bub in">${esc(m.text)}</p>${s.flags[`replied:${m.id}`] ? `<p class="bub out">${esc(m.reply)}</p>` : ''}`,
        )
        .join('');
      const next = arrived.find((m) => !s.flags[`replied:${m.id}`]);
      const input = next
        ? `<button type="button" class="ph-send" data-act="reply-${next.id}" ${this.canDo(s, `reply-${next.id}`) ? '' : 'disabled'}>${esc(next.reply)}<b>发送</b></button>`
        : `<div class="ph-input"></div>`;
      body = `<div class="ph-chat">
          <div class="ph-head"><button type="button" data-nav="home" aria-label="返回">‹</button><span>${esc(MESSAGES[0]?.from ?? '')}</span></div>
          <div class="ph-log">${bubbles || '<p class="ph-empty">还没有消息。</p>'}</div>
          ${input}
        </div>`;
    }
    this.phone.innerHTML = `<div class="ph-frame">${bar}${body}<button type="button" class="ph-down" data-close>放下手机</button></div>`;
  }

  render(s: GameState, paused: boolean, fastForward: boolean, ended: string | null): void {
    const now = performance.now();
    this.city.draw(s.t, now);
    this.winTime.textContent = hm(s.t);
    const day = daylight(s.t);
    this.dim.style.opacity = String(0.42 * (1 - day));
    this.sunPatch.style.opacity = String(0.22 * day);

    // 物件始终在场：能用时上色，不能用时灰。
    for (const o of this.objects) {
      const el = this.objs.get(o.id)!;
      const avail = objectAvailable(s, this.content.actions, o.id, o.view !== undefined && o.view !== 'menu');
      el.classList.toggle('available', avail);
    }
    const unread = MESSAGES.some((m) => s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`]);
    this.objs.get('phone')?.classList.toggle('ping', unread && !s.ongoing?.occupies);
    this.heldCup.hidden = !((s.items.cup ?? 0) > 0);
    this.soakCup.hidden = !soaking(s);
    const temp = k(s, 'temp');
    this.kettleFx.style.setProperty('--heat', String(k(s, 'water') > 0 ? Math.max(0, (temp - 55) / 45) : 0));
    this.kettleFx.classList.toggle('steaming', k(s, 'water') > 0 && temp >= 95);
    this.dispWater.style.setProperty('--level', String((s.things['dispenser.water'] ?? 0) / DISPENSER.capacity));

    const cur = s.ongoing && this.actions.get(s.ongoing.actionId);
    this.character.dataset.pose = cur?.pose ?? '';

    // 身体被占住（睡着）时，打开着的近景和屏幕都合上。
    if (this.view && s.ongoing?.occupies) this.view = null;
    this.closeup.hidden = this.view?.kind !== 'closeup';
    this.phone.hidden = this.view?.kind !== 'screen';
    if (this.view?.kind === 'closeup') this.renderCloseup(s);
    if (this.view?.kind === 'screen') this.renderPhone(s);

    for (const b of this.content.bars) {
      const v = this.bars.get(b.id)!;
      v.el.classList.toggle('shown', isVisible(s, `bar:${b.id}`));
      v.fill.style.width = `${s.bars[b.id] ?? 0}%`;
      const st = levelStyle(b, s);
      if (st) {
        v.track.style.height = `${st.thickness}px`;
        v.fill.style.background = st.color;
      }
    }

    this.status.hidden = !this.statusOpen;
    if (this.statusOpen) {
      const rows = this.content.bars.map((b) => {
        const st = levelStyle(b, s);
        const style = st ? `height:${st.thickness}px;background:${st.color}` : '';
        return `<div class="srow"><span>${b.name}</span><span class="bar-track" style="${st ? `height:${st.thickness}px` : ''}"><span class="bar-fill" style="width:${s.bars[b.id] ?? 0}%;${style}"></span></span></div>`;
      });
      const items = Object.entries(s.items)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${ITEM_NAMES[id] ?? id} ×${n}`);
      this.status.innerHTML = `<div class="stime">${stamp(s.t)}</div>${rows.join('')}${items.length ? `<div class="sitems">${items.join('　')}</div>` : ''}`;
    }

    this.pauseBtn.textContent = paused ? '继续' : '暂停';
    this.pauseBtn.hidden = !!ended;
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
