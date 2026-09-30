// 场景：房间、窗户、角色、物件、状态条、技能栏、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。
// 点物件只是打开它：弹出能做的事（menu），凑近看（closeup）。身上带的东西（手机）在左下角一栏，点一下在右侧拿出来（screen）。
// 菜单和近景里只列现在能做的事；鼠标移到物件上就弹出菜单，少点一下。
// 近景和手机都没有「离开」按钮：点它们四周就合上。手机可以用图钉固定，固定着就一直拿在手上，边看边做别的。
// 做物件上的事时，角色走到物件跟前；点地板，角色在地板上走过去（左右和前后）。
// 地板上的东西按远近排前后（data/objects 的 layerOf）。夜里房间变暗是给墙、地板、物件和角色降亮度，窗外不受影响；
// 开了灯，房间亮回来，罩上一层暖黄的光。
// 角色站在哪只是画面，不影响规则。

import type { GameState } from '../core/state';
import type { BarDef, Content } from '../core/world';
import type { ActionDef, MenuEntry } from '../core/rules';
import type { SkillDef } from '../core/skills';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { barPreview, blockedReason, objectAvailable, objectMenu, poseOf, running } from '../core/rules';
import { learned, skillProgress } from '../core/skills';
import { daylight, stamp, hm } from '../core/time';
import { MESSAGES } from '../data/messages';
import { dispenserWater, hotSource, k, vessel } from '../data/water';
import { NOODLES, PACKETS, heat, n, quality, soak, stage } from '../data/noodles';
import { layerAt, layerOf, standAt, type Spot } from '../data/objects';
import { CARRIED, carrying } from '../data/items';
import { lampOn } from '../data/room';
import { HAIR_COLOR, PERSON_PARTS, SKIN, outfit, pronoun } from '../data/person';
import { CityView } from './window';

export interface SceneIntents {
  togglePause(): void;
  clickObject(id: string): void;
  /** 点了身上带的东西（手机）：拿出来，或者放回去。 */
  openItem(id: string): void;
  chooseEntry(entry: MenuEntry): void;
  /** 在近景、屏幕或技能栏里点了某件事。开始了返回 true。 */
  doAction(actionId: string): boolean;
  /** 停下正在做的事；给了 id 就停下那一件（可能在后台）。 */
  stop(actionId?: string): void;
  /** 点了地板：能走过去返回 true（睡着时、暂停时不能）。 */
  walk(): boolean;
  restart(): void;
  /** 开局挑这个人的样子（称呼、发型、衣服），挑好了开始。 */
  choosePerson(part: string, id: string): void;
  start(): void;
}

/** 泡面上的两根竖条：热值（盖着泡够就熟）、水值（冲水后涨满就坨）。 */
const GAUGES = '<i class="ng heat"><b></b><span>热</span></i><i class="ng water"><b></b><span>水</span></i>';
function setGauges(el: HTMLElement, s: GameState): void {
  el.classList.toggle('gauged', stage(s) >= 4 && !n(s, 'ate'));
  el.style.setProperty('--nh', String(Math.min(1, heat(s) / NOODLES.readyMin)));
  el.style.setProperty('--nw', String(Math.min(1, soak(s) / NOODLES.soggyMin)));
  el.classList.toggle('cooked', heat(s) >= NOODLES.readyMin);
  el.classList.toggle('soggy', soak(s) > NOODLES.soggyMin);
  el.classList.toggle('hot', stage(s) >= 4 && soak(s) < 20);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2.5h6l-1.2 6.2 3.7 3.6v2.2h-4.3V21L12 22.5 10.8 21v-6.5H6.5v-2.2l3.7-3.6z" fill="currentColor"/></svg>';
const CONFETTI = ['#f5d36b', '#e88a5b', '#8fb3a0', '#9cc3ff', '#e5484d', '#f3efe6'];

function levelStyle(b: BarDef, s: GameState) {
  const st = b.levels?.styles;
  if (!st) return null;
  return st[Math.min(st.length - 1, s.levels[b.id] ?? 0)];
}

export class Scene {
  private readonly room: HTMLElement;
  private readonly winTime: HTMLElement;
  private readonly city: CityView;
  private readonly sunPatch: HTMLElement;
  private readonly character: HTMLElement;
  private readonly tableCup: HTMLButtonElement;
  private readonly kettleFx: HTMLElement;
  private readonly dispWater: HTMLElement;
  private readonly lampGlow: HTMLElement;
  private readonly pockets = new Map<string, HTMLButtonElement>();
  private readonly skillsEl: HTMLElement;
  private readonly skillPanel: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly cheer: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly closeup: HTMLElement;
  private readonly phone: HTMLElement;
  private readonly end: HTMLElement;
  private readonly ff: HTMLElement;
  private readonly objs = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, { el: HTMLElement; fill: HTMLElement; track: HTMLElement }>();
  private readonly feed: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly who: HTMLElement;
  private walkTimer = 0;
  private readonly actions: Map<string, ActionDef>;
  private readonly skills: readonly SkillDef[];
  private feedCount = 0;
  /** 凑近在看的东西。 */
  private closeupId: string | null = null;
  /** 手机拿在手上；固定着的不会因为走开、点别处而放下。 */
  private phoneOpen = false;
  private phonePinned = false;
  private phoneApp: 'home' | 'chat' = 'home';
  private lastViewKey = '';
  private lastPhoneKey = '';
  private lastSkillsKey = '';
  private panelSkill: string | null = null;
  private panelKey = '';
  /** 菜单开在哪个物件上；每帧按状态重算里面的项，变了才重建。 */
  private menuFor: string | null = null;
  private menuKey = '';
  private menuTimer = 0;
  /** 菜单是鼠标悬浮打开的（移开就收起）；触屏点开的菜单要点别处才收起。 */
  private menuByHover = false;
  /** 各技能上次看到的进度：进度涨了就提示，学会了就庆祝。开局第一帧只记下，不提示。 */
  private progress: Map<string, number> | null = null;
  private fresh = new Map<string, number>();
  private toastTimer = 0;
  private cheerTimer = 0;
  /** 角色站的位置：左边缘的横坐标、脚的纵坐标（房间的百分比）。 */
  private spot: Spot = { x: 51.5, y: 76 };
  private state: GameState | null = null;

  constructor(
    root: HTMLElement,
    private readonly content: Content,
    private readonly objects: readonly ObjectDef[],
    private readonly intents: SceneIntents,
  ) {
    this.actions = new Map(content.actions.map((a) => [a.id, a]));
    this.skills = content.skills ?? [];
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
          <button type="button" class="table-cup" hidden aria-label="泡面"><i class="film"></i><i class="steam"></i><i class="gauges">${GAUGES}</i><span class="tip">泡面</span></button>
          <div class="kettle-fx"><i class="glow"></i><i class="steam"></i></div>
          <div class="disp-water"></div>
          <div class="lamp-glow"></div>
          <div class="lamp-light"></div>
          <div class="character" aria-hidden="true"><i class="hair-back"></i><i class="leg l"></i><i class="leg r"></i><i class="skirt"></i><i class="neck"></i><i class="torso"></i><i class="arm l"></i><i class="arm r"></i><i class="head"><i class="hair"></i><i class="eye l"></i><i class="eye r"></i><i class="cheek l"></i><i class="cheek r"></i></i><i class="held-phone"></i></div>
          <nav class="skills" aria-label="技能"></nav>
          <nav class="pockets" aria-label="身上">${CARRIED.map(
            (c) => `<button type="button" class="pk pk-${c.id}" data-item="${c.id}" aria-label="${esc(c.name)}"><i></i><b></b><span class="tip">${esc(c.name)}</span></button>`,
          ).join('')}</nav>
          <div class="skill-panel" hidden></div>
          <div class="toast" aria-live="polite"></div>
          <div class="menu" role="menu" hidden></div>
          <div class="closeup" hidden></div>
          <div class="phone-screen" hidden></div>
          <div class="cheer" hidden><div class="confetti"></div><div class="cheer-card"><b></b><span></span></div></div>
          <div class="end" hidden>
            <p>第一片的试玩到这里结束。</p>
            <p class="end-time"></p>
            <button type="button" class="restart">重新开始</button>
          </div>
        </section>
        <section class="who" aria-label="这个人" hidden>
          <div class="who-rows">${PERSON_PARTS.map(
            (p) =>
              `<div class="who-row"><span>${p.name}</span><div class="who-opts">${p.options
                .map((o) => `<button type="button" data-part="${p.id}" data-opt="${o.id}">${esc(o.name)}</button>`)
                .join('')}</div></div>`,
          ).join('')}</div>
          <button type="button" class="who-go">就这样，开始</button>
        </section>
        <section class="bars" aria-label="状态"></section>
        <ol class="feed" aria-live="polite"></ol>
      </main>`;
    const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
    this.room = $('.room');
    this.winTime = $('.win-time');
    this.city = new CityView($('.city'));
    this.sunPatch = $('.sun-patch');
    this.character = $('.character');
    this.tableCup = $('.table-cup');
    this.kettleFx = $('.kettle-fx');
    this.dispWater = $('.disp-water');
    this.lampGlow = $('.lamp-glow');
    for (const b of root.querySelectorAll<HTMLButtonElement>('.pk')) this.pockets.set(b.dataset.item!, b);
    this.skillsEl = $('.skills');
    this.skillPanel = $('.skill-panel');
    this.toast = $('.toast');
    this.cheer = $('.cheer');
    this.menu = $('.menu');
    this.closeup = $('.closeup');
    this.phone = $('.phone-screen');
    this.end = $('.end');
    this.ff = $('.ff');
    this.feed = $('.feed');
    this.pauseBtn = $('.pause');
    this.who = $('.who');
    // 开局挑样子：点一项，房间里的人跟着变；挑好了开始。
    this.who.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-part]');
      if (t) intents.choosePerson(t.dataset.part!, t.dataset.opt!);
    });
    $('.who-go').addEventListener('click', () => intents.start());
    this.pauseBtn.addEventListener('click', () => intents.togglePause());
    // 桌上的面：点它就是凑近小桌上的这一桶。
    this.tableCup.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
      intents.clickObject('table');
    });
    $('.restart').addEventListener('click', () => intents.restart());
    // 身上的东西：点一下拿出来，再点一下放回去。
    $('.pockets').addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-item]');
      if (!t || t.disabled) return;
      this.hideMenu();
      this.panelSkill = null;
      intents.openItem(t.dataset.item!);
    });
    // 点房间里空的地方：收起菜单，放下手机。点到房间外面（页面四周、状态条、事件流），近景也合上。
    this.room.addEventListener('click', () => this.dismiss());
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.room') && !t.closest('.top')) {
        this.dismiss();
        this.closeCloseup();
      }
    });
    // 点地板：角色走过去，左右、前后都能走。
    $('.floor').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
      if (!intents.walk()) return;
      const box = this.room.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * 100 - 2.5;
      const y = ((e.clientY - box.top) / box.height) * 100;
      this.moveTo({ x: Math.min(93, Math.max(1, x)), y: Math.min(97, Math.max(73.5, y)) });
    });
    for (const el of [this.menu, this.closeup, this.phone, this.skillPanel]) el.addEventListener('click', (e) => e.stopPropagation());
    // 菜单和技能说明：鼠标移出物件、菜单或技能栏一会儿后收起。
    this.menu.addEventListener('pointerenter', () => this.keepMenu());
    this.menu.addEventListener('pointerleave', () => this.hideMenuSoon());
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = e.target as HTMLElement;
      if (this.panelSkill && !t.closest('.skills')) this.showSkillPanel(null);
      if (this.menuFor && this.menuByHover && !t.closest('.menu') && !t.closest(`.obj-${this.menuFor}`)) this.hideMenuSoon();
    });

    // 近景和手机里的点击都走事件委托：data-act 做事，data-open 换成另一个近景，data-nav 切换界面，data-pin 固定手机。
    // 点近景四周空着的地方（背景）就合上。
    this.closeup.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.closeup || target.dataset.backdrop !== undefined) return this.closeCloseup();
      const t = target.closest<HTMLElement>('[data-act],[data-open]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      if (t.dataset.act && !this.act(t.dataset.act)) return;
      if (t.dataset.open) this.openView('closeup', t.dataset.open);
      this.lastViewKey = '';
    });
    this.phone.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-nav],[data-pin]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      if (t.dataset.pin !== undefined) this.phonePinned = !this.phonePinned;
      else if (t.dataset.nav) this.phoneApp = t.dataset.nav as 'home' | 'chat';
      else if (t.dataset.act) this.act(t.dataset.act);
      this.lastPhoneKey = '';
    });

    // 技能栏：鼠标移上去就在旁边显示怎样才算会、学到哪了；学会了就一点即做（做着时再点，提前收尾）。
    // 触屏上没有悬浮，还在学时点一下也能看。
    this.skillsEl.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-skill]');
      if (t && e.pointerType === 'mouse') this.showSkillPanel(t.dataset.skill!);
    });
    this.skillsEl.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.showSkillPanel(null);
    });
    this.skillsEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skill]');
      if (!t || t.disabled || !this.state) return;
      const sk = this.skills.find((x) => x.id === t.dataset.skill)!;
      this.hideMenu();
      if (!learned(this.state, sk)) return this.showSkillPanel(this.panelSkill === sk.id ? null : sk.id);
      if (running(this.state, sk.auto)) this.intents.stop(sk.auto);
      else this.act(sk.auto);
      this.lastSkillsKey = '';
    });

    for (const o of objects) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `obj obj-${o.id}`;
      el.dataset.id = o.id;
      el.setAttribute('aria-label', o.name);
      el.innerHTML = `<span class="obj-name">${o.name}</span>`;
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, zIndex: String(layerOf(o.id)) });
      const menuObj = (o.view ?? 'menu') === 'menu';
      // 有菜单的物件：鼠标移上去就弹出菜单；点一下也行（触屏）。能打开来看的物件：点一下打开。
      el.addEventListener('pointerenter', (e) => {
        if (menuObj && e.pointerType === 'mouse') this.openMenu(o.id, true);
      });
      el.addEventListener('pointerleave', (e) => {
        if (menuObj && e.pointerType === 'mouse') this.hideMenuSoon();
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.panelSkill = null;
        if (menuObj) return this.openMenu(o.id, (e as PointerEvent).pointerType === 'mouse');
        this.hideMenu();
        intents.clickObject(o.id);
      });
      this.room.insertBefore(el, this.character);
      this.objs.set(o.id, el);
    }

    // 桌上、壶上、饮水机上的东西画在它们所在物件的上一层。
    this.tableCup.style.zIndex = String(layerOf('table') + 2);
    this.kettleFx.style.zIndex = String(layerOf('kettle') + 1);
    this.dispWater.style.zIndex = String(layerOf('dispenser') + 1);
    this.lampGlow.style.zIndex = String(layerOf('lamp') + 1);

    const barsEl = $('.bars');
    for (const b of content.bars) {
      const el = document.createElement('div');
      el.className = `bar bar-${b.id}`;
      el.innerHTML = `<span class="bar-name">${b.name}</span><span class="bar-track"><span class="bar-fill"></span></span>`;
      barsEl.appendChild(el);
      this.bars.set(b.id, { el, fill: el.querySelector('.bar-fill')!, track: el.querySelector('.bar-track')! });
    }
  }

  /** 做一件事；开始了就让角色走到它所在的物件跟前（只用手的事不用走）。 */
  private act(id: string): boolean {
    const a = this.actions.get(id);
    if (!a || !this.intents.doAction(id)) return false;
    this.walkTo(a);
    return true;
  }

  /** 开始了一件物件上的事：角色走过去。 */
  private walkTo(a: ActionDef): void {
    const p = a.hands ? undefined : standAt(a.object);
    if (p) this.moveTo(p);
  }

  /** 走到某处：走得越远用时越久（只是画面，不花游戏时间）。起身走开就放下没固定的手机。 */
  private moveTo(p: Spot): void {
    if (p.x === this.spot.x && p.y === this.spot.y) return;
    this.putDownPhone();
    const d = Math.hypot(p.x - this.spot.x, (p.y - this.spot.y) * 1.6);
    const dur = Math.min(1.4, Math.max(0.25, d * 0.028));
    this.character.style.setProperty('--walk', `${dur.toFixed(2)}s`);
    this.spot = { ...p };
    // 走路时迈腿、摆手。
    this.character.classList.add('walking');
    clearTimeout(this.walkTimer);
    this.walkTimer = window.setTimeout(() => this.character.classList.remove('walking'), dur * 1000);
  }

  private dismiss(): void {
    this.hideMenu();
    this.panelSkill = null;
    this.putDownPhone();
  }

  private openMenu(objectId: string, byHover: boolean): void {
    this.keepMenu();
    if (this.menuFor !== objectId) this.menuKey = '';
    this.menuFor = objectId;
    this.menuByHover = byHover;
    if (this.state) this.renderMenu(this.state);
  }

  private keepMenu(): void {
    clearTimeout(this.menuTimer);
    this.menuTimer = 0;
  }

  private hideMenuSoon(): void {
    if (this.menuTimer) return;
    this.menuTimer = window.setTimeout(() => this.hideMenu(), 280);
  }

  /** 菜单里的项跟着状态变：做不了的事消失，新能做的出现；什么都做不了时收起。 */
  private renderMenu(s: GameState): void {
    const id = this.menuFor;
    if (!id) return;
    const entries = objectMenu(s, this.content.actions, id, (aid) => this.shown(s, aid));
    const key = entries.map((e) => `${e.kind}:${e.action.id}`).join();
    if (entries.length === 0) {
      this.menu.hidden = true;
      this.menuKey = '';
      return;
    }
    if (key !== this.menuKey || this.menu.hidden) this.showMenu(id, entries, s);
    this.menuKey = key;
  }

  private showMenu(objectId: string, entries: readonly MenuEntry[], s: GameState): void {
    const anchor = this.objs.get(objectId);
    if (!anchor) return;
    const names = new Map(this.content.bars.map((b) => [b.id, b.name]));
    this.menu.innerHTML = '';
    for (const entry of entries) {
      const a = entry.action;
      const btn = document.createElement('button');
      btn.type = 'button';
      const label = entry.kind === 'stop' ? a.stopLabel! : a.label;
      const preview =
        entry.kind === 'stop'
          ? ''
          : [
              ...Object.entries(barPreview(s, a)).map(([id, d]) => `${names.get(id) ?? id}${d > 0 ? '↑' : '↓'}`),
              a.minutes ? `${a.minutes} 分钟` : '',
            ]
              .filter(Boolean)
              .join(' ');
      btn.innerHTML = `<span>${esc(label)}</span><small>${preview}</small>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideMenu();
        this.intents.chooseEntry(entry);
        if (entry.kind === 'start') this.walkTo(a);
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
    this.keepMenu();
    this.menuFor = null;
    this.menuKey = '';
    this.menu.hidden = true;
  }

  /** 凑近看一样东西，或者拿出手机（再点一下就放回去，固定着的也一样）。凑近别的东西时，没固定的手机先放下。 */
  openView(kind: 'closeup' | 'screen', id: string): void {
    if (kind === 'screen') {
      if (this.phoneOpen) {
        this.phonePinned = false;
        return this.putDownPhone();
      }
      this.phoneOpen = true;
      this.lastPhoneKey = '';
      return;
    }
    this.closeupId = id;
    this.lastViewKey = '';
    this.putDownPhone();
  }

  /** 合上近景；没有近景时放下没固定的手机。 */
  closeView(): void {
    if (this.closeupId) this.closeCloseup();
    else this.putDownPhone();
  }

  private closeCloseup(): void {
    this.closeupId = null;
    this.lastViewKey = '';
  }

  private putDownPhone(): void {
    if (!this.phoneOpen || this.phonePinned) return;
    this.phoneOpen = false;
    this.lastPhoneKey = '';
  }

  private canDo(s: GameState, id: string): boolean {
    const a = this.actions.get(id);
    return !!a && blockedReason(s, a) === null;
  }

  private shown(s: GameState, id: string): boolean {
    const gated = this.content.reveals.some((r) => r.id === `act:${id}`);
    return !gated || isVisible(s, `act:${id}`);
  }

  /** 某个物件上现在能做的手动的事。 */
  private doable(s: GameState, objectId: string): ActionDef[] {
    return this.content.actions.filter((a) => a.object === objectId && !a.auto && this.shown(s, a.id) && this.canDo(s, a.id));
  }

  private renderCloseup(s: GameState): void {
    if (this.closeupId === 'kettle') return this.renderKettle(s);
    if (this.closeupId === 'table') return this.renderNoodle(s);
    const count = s.items.noodles ?? 0;
    const onTable = stage(s) > 0;
    const unpack = this.shown(s, 'unpack') && this.canDo(s, 'unpack');
    const key = `bag|${count}|${onTable}|${unpack}`;
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;
    // 点一桶面：拿出来放到桌上，接着凑近桌上这桶；桌上已经有一桶了，就直接去看那一桶。
    const cups = Array.from(
      { length: count },
      (_, i) =>
        `<button type="button" class="cup" ${onTable ? '' : 'data-act="take-noodles"'} data-open="table" aria-label="桶面" style="--i:${i}"><i></i><span class="tip">桶面</span></button>`,
    ).join('');
    const clothes = unpack
      ? `<button type="button" class="clothes" data-act="unpack"><span>整理行李</span></button>`
      : `<div class="clothes"></div>`;
    this.closeup.innerHTML = `
      <div class="case">
        <div class="lid"><div class="lining"></div></div>
        <div class="base">${clothes}<div class="cups">${cups}</div></div>
      </div>`;
  }

  private sideButtons(s: GameState, objectId: string): string {
    return this.doable(s, objectId)
      .map((a) => `<button type="button" class="kv-btn" data-act="${a.id}">${esc(a.label)}</button>`)
      .join('');
  }

  /** 水壶近景：左边是水壶（水位、红晕、气泡、白气），右边是现在能做的事。 */
  private renderKettle(s: GameState): void {
    const key = `kettle|${this.doable(s, 'kettle').map((a) => a.id).join()}|${k(s, 'broken')}`;
    if (key !== this.lastViewKey) {
      this.lastViewKey = key;
      const note = k(s, 'broken') ? '<p class="nv-note">壶底烧黑了，开关按下去没反应。</p>' : '';
      this.closeup.innerHTML = `
        <div class="kv" data-backdrop>
          <div class="kv-kettle"><div class="kv-body"><i class="kv-water"></i><i class="kv-glow"></i><i class="kv-bubbles"></i></div><i class="kv-lid"></i><i class="kv-handle"></i><i class="kv-spout"></i><i class="kv-led"></i><i class="kv-steam"></i></div>
          <div class="kv-side" data-backdrop>${note}${this.sideButtons(s, 'kettle')}</div>
        </div>`;
    }
    // 水位、温度、开关这些每分钟都在变，直接改样式，不重建按钮。
    const el = this.closeup.querySelector<HTMLElement>('.kv-kettle');
    if (!el) return;
    const temp = k(s, 'temp');
    const on = !!k(s, 'on');
    el.style.setProperty('--level', String(k(s, 'water') / vessel('kettle').capacity));
    el.style.setProperty('--heat', String(Math.max(0, (temp - 55) / 45)));
    el.classList.toggle('on', on);
    el.classList.toggle('bubbling', on && k(s, 'water') > 0 && temp >= 80);
    el.classList.toggle('steaming', k(s, 'water') > 0 && temp >= 95);
    el.classList.toggle('broken', !!k(s, 'broken'));
  }

  /**
   * 泡面近景：桌上这一桶是主角。封着、撕开、料包和叉子摆在旁边、冲上热水、盖上盖子用叉子压住、揭开。
   * 右边只列现在能做的步骤；料包也可以直接点。
   */
  private renderNoodle(s: GameState): void {
    const st = stage(s);
    if (st === 0) return this.closeCloseup();
    const acts = this.doable(s, 'table');
    const q = st === 6 ? quality(s) : -1;
    const needHot = st === 3 && !hotSource(s, NOODLES.water);
    const key = `noodle|${st}|${PACKETS.map((p) => n(s, p.id)).join('')}|${acts.map((a) => a.id).join()}|${q}|${needHot}`;
    if (key !== this.lastViewKey) {
      this.lastViewKey = key;
      const packets = PACKETS.map((p) => {
        const out = st >= 3 && !n(s, p.id);
        const can = acts.some((a) => a.id === `noodle-${p.id}`);
        return out ? `<button type="button" class="nv-pk ${p.id}" ${can ? `data-act="noodle-${p.id}"` : 'disabled'} aria-label="${p.name}"><span class="tip">${p.name}</span></button>` : '';
      }).join('');
      const note = needHot
        ? '要冲热水才能泡。'
        : st === 6
          ? ['面还硬着。', '泡好了。', '面泡坨了。'][q]
          : '';
      const flecks = PACKETS.filter((p) => n(s, p.id)).map((p) => p.id).join(' ');
      this.closeup.innerHTML = `
        <div class="kv nv" data-backdrop>
          <div class="nv-scene" data-stage="${st}" data-q="${q}">
            <i class="nv-table"></i>
            <div class="nv-cup"><i class="nv-label">面</i></div>
            <div class="nv-rim"><i class="nv-in ${flecks}"></i></div>
            <i class="nv-film"></i>
            <i class="nv-fork"></i>
            <i class="nv-steam"></i>
            <div class="nv-packets">${packets}</div>
            <div class="nv-gauges gauges">${GAUGES}</div>
          </div>
          <div class="kv-side" data-backdrop>
            <p class="nv-note">${note}</p>
            ${acts.map((a) => `<button type="button" class="kv-btn" data-act="${a.id}">${esc(a.label)}</button>`).join('')}
          </div>
        </div>`;
    }
    const scene = this.closeup.querySelector<HTMLElement>('.nv-scene');
    if (scene) setGauges(scene, s);
  }

  private renderPhone(s: GameState): void {
    const arrived = MESSAGES.filter((m) => s.flags[`msg:${m.id}`]);
    const unread = arrived.filter((m) => !s.flags[`replied:${m.id}`]).length;
    const key = `phone|${this.phoneApp}|${this.phonePinned}|${arrived.length}|${unread}|${arrived.map((m) => this.canDo(s, `reply-${m.id}`)).join()}`;
    const clock = this.phone.querySelector('.ph-time');
    if (key === this.lastPhoneKey) {
      if (clock) clock.textContent = hm(s.t);
      return;
    }
    this.lastPhoneKey = key;
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
      const next = arrived.find((m) => !s.flags[`replied:${m.id}`] && this.canDo(s, `reply-${m.id}`));
      const input = next
        ? `<button type="button" class="ph-send" data-act="reply-${next.id}">${esc(next.reply)}<b>发送</b></button>`
        : `<div class="ph-input"></div>`;
      body = `<div class="ph-chat">
          <div class="ph-head"><button type="button" data-nav="home" aria-label="返回">‹</button><span>${esc(MESSAGES[0]?.from ?? '')}</span></div>
          <div class="ph-log">${bubbles || '<p class="ph-empty">还没有消息。</p>'}</div>
          ${input}
        </div>`;
    }
    // 图钉：固定住，手机就一直拿在手上，走开、做别的事都不放下；再点一下取消。
    const pinned = this.phonePinned;
    const pin = `<button type="button" class="ph-pin${pinned ? ' on' : ''}" data-pin aria-pressed="${pinned}" title="${pinned ? '取消固定' : '固定手机，边看边做别的'}" aria-label="${pinned ? '取消固定' : '固定手机'}">${PIN_SVG}</button>`;
    this.phone.innerHTML = `${pin}<div class="ph-frame">${bar}${body}</div>`;
  }

  /** 技能栏：第一次做某件事时出现它的按钮。还在学是虚线框和进度，学会了是实心的，正在自动做时在呼吸。 */
  private renderSkills(s: GameState, now: number): void {
    const shownSkills = this.skills.filter((k) => isVisible(s, `act:${k.auto}`));
    const rows = shownSkills.map((k) => {
      const p = skillProgress(s, k);
      const done = learned(s, k);
      const busy = running(s, k.auto);
      const blocked = done && !busy && !this.canDo(s, k.auto);
      const isNew = (this.fresh.get(k.id) ?? 0) > now;
      return { k, p, done, running: busy, blocked, isNew };
    });
    const key = rows.map((r) => `${r.k.id}:${r.p.have}/${r.p.need}:${r.done}:${r.running}:${r.blocked}:${r.isNew}`).join('|');
    if (key === this.lastSkillsKey) return this.renderSkillPanel(s);
    this.lastSkillsKey = key;
    this.skillsEl.dataset.count = String(rows.length);
    this.skillsEl.innerHTML = rows
      .map((r) => {
        const cls = ['sk', r.done ? 'learned' : 'learning', r.running ? 'running' : '', r.isNew ? 'new' : ''].join(' ');
        const sub = r.done ? (r.running ? '做着呢' : '自动') : `${r.p.have}/${r.p.need}`;
        const bar = r.done ? '' : `<i class="sk-bar" style="--p:${r.p.have / r.p.need}"></i>`;
        return `<button type="button" class="${cls}" data-skill="${r.k.id}" ${r.blocked ? 'disabled' : ''}><b>${esc(r.k.name)}</b><small>${sub}</small>${bar}</button>`;
      })
      .join('');
    this.renderSkillPanel(s);
  }

  private showSkillPanel(id: string | null): void {
    if (this.panelSkill === id) return;
    this.panelSkill = id;
    this.panelKey = '';
    if (this.state) this.renderSkillPanel(this.state);
  }

  /** 技能按钮旁边的说明：还在学时是每个条件和进度，学会了说一句怎么用。 */
  private renderSkillPanel(s: GameState): void {
    const sk = this.panelSkill ? this.skills.find((x) => x.id === this.panelSkill) : undefined;
    const btn = sk && this.skillsEl.querySelector<HTMLElement>(`[data-skill="${sk.id}"]`);
    this.skillPanel.hidden = !btn;
    if (!sk || !btn) return;
    const p0 = skillProgress(s, sk);
    const key = `${sk.id}|${p0.have}|${learned(s, sk)}|${btn.offsetTop}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    if (learned(s, sk)) {
      this.skillPanel.innerHTML = `<div class="sp-head"><b>${esc(sk.name)}</b><em>会了</em></div><p class="sp-foot">点一下，${pronoun(s)}就自己做完；做着的时候再点一下，提前收尾。</p>`;
    } else {
      const p = skillProgress(s, sk);
      const conds = sk.conditions
        .map((c) => {
          const have = Math.min(c.need, c.have(s));
          return `<li class="${have >= c.need ? 'ok' : ''}"><p>${esc(c.label)}</p><div class="sp-row"><i class="sp-bar" style="--p:${have / c.need}"></i><em>${have}/${c.need}</em></div></li>`;
        })
        .join('');
      this.skillPanel.innerHTML = `<div class="sp-head"><b>学会「${esc(sk.name)}」</b><em>${p.have}/${p.need}</em></div><ul>${conds}</ul><p class="sp-foot">学会之后，点这个按钮${pronoun(s)}就自己做。</p>`;
    }
    this.skillPanel.style.left = `${this.skillsEl.offsetLeft + btn.offsetLeft + btn.offsetWidth + 8}px`;
    this.skillPanel.style.top = `${this.skillsEl.offsetTop + btn.offsetTop}px`;
  }

  /** 开局挑样子的那一栏：挑着的项按下去；开始后收起。 */
  private renderWho(s: GameState, picking: boolean): void {
    this.who.hidden = !picking;
    this.room.classList.toggle('picking', picking);
    if (!picking) return;
    for (const b of this.who.querySelectorAll<HTMLElement>('[data-part]')) {
      b.setAttribute('aria-pressed', String(s.person[b.dataset.part!] === b.dataset.opt));
    }
  }

  /** 按这个人的样子画：肤色、发型、衣服。 */
  private dressCharacter(s: GameState): void {
    const o = outfit(s);
    const c = this.character;
    c.dataset.hair = s.person.hair ?? 'short';
    c.classList.toggle('skirted', !!o.skirt);
    c.style.setProperty('--skin', SKIN);
    c.style.setProperty('--hair', HAIR_COLOR);
    c.style.setProperty('--top', o.top);
    c.style.setProperty('--legs', o.legs);
    c.style.setProperty('--shoes', o.shoes);
    c.style.setProperty('--skirt', o.skirt ?? 'transparent');
  }

  /** 进度涨了：小提示；学会了：庆祝。 */
  private noticeProgress(s: GameState, now: number): void {
    const cur = new Map(this.skills.map((k) => [k.id, skillProgress(s, k).have]));
    const prev = this.progress;
    this.progress = cur;
    if (!prev) return;
    for (const k of this.skills) {
      const was = prev.get(k.id) ?? 0;
      const is = cur.get(k.id) ?? 0;
      if (!isVisible(s, `act:${k.auto}`)) continue;
      if (!this.fresh.has(k.id)) this.fresh.set(k.id, now + 4000);
      if (is <= was) continue;
      if (learned(s, k)) this.celebrate(k.name, pronoun(s));
      else {
        const p = skillProgress(s, k);
        this.showToast(`${k.name} 熟练度 +1　${p.have}/${p.need}`);
      }
      this.fresh.set(k.id, now + 4000);
    }
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2600);
  }

  private celebrate(name: string, who: string): void {
    this.cheer.querySelector('b')!.textContent = `学会了 ${name}！`;
    this.cheer.querySelector('span')!.textContent = `【自动】已解锁，点左上角的按钮就能让${who}自己做`;
    const box = this.cheer.querySelector('.confetti')!;
    box.innerHTML = Array.from({ length: 48 }, (_, i) => {
      const c = CONFETTI[i % CONFETTI.length];
      const x = (i * 37) % 100;
      const d = ((i * 53) % 60) / 100;
      const r = (i * 71) % 360;
      return `<i style="left:${x}%;background:${c};animation-delay:${d}s;--r:${r}deg"></i>`;
    }).join('');
    this.cheer.hidden = false;
    this.cheer.classList.remove('go');
    void (this.cheer as HTMLElement).offsetWidth;
    this.cheer.classList.add('go');
    clearTimeout(this.cheerTimer);
    this.cheerTimer = window.setTimeout(() => {
      this.cheer.hidden = true;
    }, 3600);
  }

  render(s: GameState, paused: boolean, fastForward: boolean, ended: string | null, picking = false): void {
    this.state = s;
    this.renderWho(s, picking);
    const now = performance.now();
    this.city.draw(s.t, now);
    this.winTime.textContent = hm(s.t);
    const day = daylight(s.t);
    // 开着灯，夜里也亮堂，只是比白天暖一点；白天开灯看不太出来。
    const lamp = lampOn(s);
    this.room.style.setProperty('--lit', (1 - 0.42 * (1 - day) * (lamp ? 0.2 : 1)).toFixed(3));
    this.room.style.setProperty('--lamp', lamp ? (1 - 0.8 * day).toFixed(3) : '0');
    this.room.classList.toggle('lamp-on', lamp);
    this.sunPatch.style.opacity = String(0.22 * day);

    // 物件始终在场：能用时上色，不能用时灰。
    for (const o of this.objects) {
      const el = this.objs.get(o.id)!;
      el.classList.toggle('available', objectAvailable(s, this.content.actions, o.id, !!o.peek));
    }
    // 身上的东西：睡着时拿不出来；来了消息，手机亮起来，角上是没回的条数。
    const unread = MESSAGES.filter((m) => s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`]).length;
    for (const [id, b] of this.pockets) {
      b.hidden = !carrying(s, id);
      b.disabled = !objectAvailable(s, this.content.actions, id, true);
      b.classList.toggle('ping', id === 'phone' && unread > 0 && !s.ongoing?.occupies);
      b.classList.toggle('open', id === 'phone' && this.phoneOpen && !s.ongoing?.occupies);
      b.querySelector('b')!.textContent = id === 'phone' && unread ? String(unread) : '';
    }

    // 桌上的那桶面：封着、撕开、泡着（盖着冒气）、揭开；正在吃时也在。
    const cur = s.ongoing ? this.actions.get(s.ongoing.actionId) : undefined;
    const pose = poseOf(s, this.content.actions);
    const st = stage(s);
    this.tableCup.hidden = !(st > 0 || pose === 'eat');
    this.tableCup.disabled = st === 0;
    this.tableCup.dataset.stage = String(st);
    setGauges(this.tableCup, s);
    const temp = k(s, 'temp');
    this.kettleFx.style.setProperty('--heat', String(k(s, 'water') > 0 ? Math.max(0, (temp - 55) / 45) : 0));
    this.kettleFx.classList.toggle('steaming', k(s, 'water') > 0 && temp >= 95);
    this.dispWater.style.setProperty('--level', String(dispenserWater(s) / vessel('dispenser').capacity));

    // 角色：正在做的事在哪个物件上，就站在那里；否则站在上次走到的地方。
    // 远近：脚越靠下越在前面，也画得稍大一点；躺在床上时在床和手机之间。
    const at = cur && !cur.hands ? standAt(cur.object) : undefined;
    if (at) this.moveTo(at);
    const onBed = pose === 'lie' || pose === 'sleep';
    this.character.style.setProperty('--x', `${this.spot.x}%`);
    this.character.style.setProperty('--y', `${this.spot.y}%`);
    this.character.style.setProperty('--s', (1 + (this.spot.y - 76) * 0.012).toFixed(3));
    this.character.style.zIndex = String(onBed ? layerOf('bed') + 1 : layerAt(this.spot.y));
    // 身体被占住（睡着）时，近景合上，手机放下；固定着的手机先收起来，醒了还在手上。
    const busy = !!s.ongoing?.occupies;
    if (busy) {
      this.closeCloseup();
      this.putDownPhone();
    }
    const phoneShown = this.phoneOpen && !busy;
    this.character.dataset.pose = pose || (phoneShown ? 'phone' : '');
    this.dressCharacter(s);
    this.renderMenu(s);

    if (this.closeupId) this.renderCloseup(s);
    if (phoneShown) this.renderPhone(s);
    this.closeup.hidden = !this.closeupId;
    this.closeup.classList.toggle('beside-phone', phoneShown);
    this.phone.hidden = !phoneShown;

    this.noticeProgress(s, now);
    this.renderSkills(s, now);

    for (const b of this.content.bars) {
      const v = this.bars.get(b.id)!;
      v.el.classList.toggle('shown', isVisible(s, `bar:${b.id}`));
      v.fill.style.width = `${s.bars[b.id] ?? 0}%`;
      const style = levelStyle(b, s);
      if (style) {
        v.track.style.height = `${style.thickness}px`;
        v.fill.style.background = style.color;
      }
    }

    this.pauseBtn.textContent = paused ? '继续' : '暂停';
    this.pauseBtn.hidden = !!ended || picking;
    this.room.classList.toggle('paused', paused && !ended && !picking);
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

