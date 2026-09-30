// 场景：房间、窗户、角色、物件、状态条、技能栏、事件流和暂停的绘制与点击。
// 只读状态、只通过回调发出意图；不直接改状态，规则留在 core/。
// 条的淡入淡出靠切换 .shown 类；物件常驻，靠切换 .available 类在灰与上色之间过渡。
// 点物件只是打开它：弹出能做的事（menu），凑近看（closeup），或者在右侧打开屏幕（screen）。
// 菜单和近景里只列现在能做的事。做物件上的事时，角色走到物件跟前；点地板，角色走过去。
// 角色站在哪只是画面，不影响规则。

import type { GameState } from '../core/state';
import type { BarDef, Content } from '../core/world';
import type { ActionDef, MenuEntry } from '../core/rules';
import type { SkillDef } from '../core/skills';
import type { ObjectDef } from '../data/objects';
import { isVisible } from '../core/reveal';
import { barPreview, blockedReason, objectAvailable, poseOf } from '../core/rules';
import { learned, skillProgress } from '../core/skills';
import { daylight, stamp, hm } from '../core/time';
import { ITEM_NAMES } from '../data/items';
import { MESSAGES } from '../data/messages';
import { dispenserWater, hotSource, k, vessel } from '../data/water';
import { NOODLES, PACKETS, n, quality, soakedFor, stage } from '../data/noodles';
import { standAt } from '../data/objects';
import { CityView } from './window';

export interface SceneIntents {
  togglePause(): void;
  clickObject(id: string): void;
  chooseEntry(entry: MenuEntry): void;
  /** 在近景、屏幕或技能栏里点了某件事。开始了返回 true。 */
  doAction(actionId: string): boolean;
  /** 停下正在做的事。 */
  stop(): void;
  /** 点了地板：能走过去返回 true（睡着时不能）。 */
  walk(): boolean;
  restart(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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
  private readonly dim: HTMLElement;
  private readonly sunPatch: HTMLElement;
  private readonly character: HTMLElement;
  private readonly tableCup: HTMLElement;
  private readonly kettleFx: HTMLElement;
  private readonly dispWater: HTMLElement;
  private readonly skillsEl: HTMLElement;
  private readonly skillPanel: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly cheer: HTMLElement;
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
  private readonly skills: readonly SkillDef[];
  private feedCount = 0;
  private statusOpen = false;
  private view: { kind: 'closeup' | 'screen'; id: string } | null = null;
  private phoneApp: 'home' | 'chat' = 'home';
  private lastViewKey = '';
  private lastSkillsKey = '';
  private panelSkill: string | null = null;
  /** 各技能上次看到的进度：进度涨了就提示，学会了就庆祝。开局第一帧只记下，不提示。 */
  private progress: Map<string, number> | null = null;
  private fresh = new Map<string, number>();
  private toastTimer = 0;
  private cheerTimer = 0;
  /** 角色站的位置（房间宽度的百分比）。 */
  private charX = 51.5;
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
          <div class="table-cup" hidden><i class="film"></i><i class="steam"></i></div>
          <div class="kettle-fx"><i class="glow"></i><i class="steam"></i></div>
          <div class="disp-water"></div>
          <button class="character" type="button" aria-label="角色"><i class="head"></i><i class="body"></i></button>
          <div class="dim"></div>
          <nav class="skills" aria-label="技能"></nav>
          <div class="skill-panel" hidden></div>
          <div class="toast" aria-live="polite"></div>
          <div class="menu" role="menu" hidden></div>
          <div class="status" hidden></div>
          <div class="closeup" hidden></div>
          <div class="phone-screen" hidden></div>
          <div class="cheer" hidden><div class="confetti"></div><div class="cheer-card"><b></b><span>【自动】已解锁，点左上角的按钮就能让他自己做</span></div></div>
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
    this.tableCup = $('.table-cup');
    this.kettleFx = $('.kettle-fx');
    this.dispWater = $('.disp-water');
    this.skillsEl = $('.skills');
    this.skillPanel = $('.skill-panel');
    this.toast = $('.toast');
    this.cheer = $('.cheer');
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
    // 点房间里空的地方：收起菜单、状态和手机。点到房间外面（页面四周、状态条、事件流），近景也合上。
    this.room.addEventListener('click', () => this.dismiss());
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.room') && !t.closest('.top')) {
        this.dismiss();
        this.closeView();
      }
    });
    // 点地板：角色走过去。
    $('.floor').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
      if (!intents.walk()) return;
      const box = this.room.getBoundingClientRect();
      this.charX = Math.min(92, Math.max(2, ((e.clientX - box.left) / box.width) * 100 - 2.5));
    });
    for (const el of [this.menu, this.status, this.closeup, this.phone, this.skillPanel]) el.addEventListener('click', (e) => e.stopPropagation());

    // 近景和屏幕里的点击都走事件委托：data-act 做事，data-open 换成另一个近景，data-nav 切换界面，data-close 关掉。
    // 点近景四周空着的地方（背景）也会关掉。
    for (const el of [this.closeup, this.phone]) {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === el || target.dataset.backdrop !== undefined) return this.closeView();
        const t = target.closest<HTMLElement>('[data-act],[data-open],[data-nav],[data-close]');
        if (!t || (t as HTMLButtonElement).disabled) return;
        if (t.dataset.close !== undefined) return this.closeView();
        if (t.dataset.nav) {
          this.phoneApp = t.dataset.nav as 'home' | 'chat';
          this.lastViewKey = '';
          return;
        }
        if (t.dataset.act && !this.act(t.dataset.act)) return;
        if (t.dataset.open) this.openView('closeup', t.dataset.open);
        this.lastViewKey = '';
      });
    }

    // 技能栏：学会了就一点即做（再点停下）；还在学时点开看要怎样才算会。
    this.skillsEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skill]');
      if (!t || t.disabled || !this.state) return;
      const sk = this.skills.find((x) => x.id === t.dataset.skill)!;
      this.hideMenu();
      if (!learned(this.state, sk)) {
        this.panelSkill = this.panelSkill === sk.id ? null : sk.id;
        this.lastSkillsKey = '';
        return;
      }
      this.panelSkill = null;
      if (this.state.ongoing?.actionId === sk.auto) this.intents.stop();
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
      Object.assign(el.style, { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%` });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.statusOpen = false;
        this.panelSkill = null;
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

  /** 做一件事；开始了就让角色走到它所在的物件跟前（只用手的事不用走）。 */
  private act(id: string): boolean {
    const a = this.actions.get(id);
    if (!a || !this.intents.doAction(id)) return false;
    this.walkTo(a);
    return true;
  }

  /** 选了菜单里的一项之后调用：角色走过去。 */
  walkTo(a: ActionDef): void {
    const x = a.hands ? undefined : standAt(a.object);
    if (x !== undefined) this.charX = x;
  }

  private dismiss(): void {
    this.hideMenu();
    this.statusOpen = false;
    this.panelSkill = null;
    if (this.view?.kind === 'screen') this.closeView();
  }

  showMenu(objectId: string, entries: readonly MenuEntry[], s: GameState): void {
    const anchor = this.objs.get(objectId);
    if (!anchor || entries.length === 0) return;
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

  /** 某个物件上现在能做的手动的事。 */
  private doable(s: GameState, objectId: string): ActionDef[] {
    return this.content.actions.filter((a) => a.object === objectId && !a.auto && this.shown(s, a.id) && this.canDo(s, a.id));
  }

  private renderCloseup(s: GameState): void {
    if (this.view?.id === 'kettle') return this.renderKettle(s);
    if (this.view?.id === 'table') return this.renderNoodle(s);
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
      </div>
      <button type="button" class="cu-close" data-close>合上箱子</button>`;
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
          <div class="kv-side" data-backdrop>${note}${this.sideButtons(s, 'kettle')}<button type="button" class="cu-close" data-close>走开</button></div>
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
    if (st === 0) return this.closeView();
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
          </div>
          <div class="kv-side" data-backdrop>
            <p class="nv-note">${note}<small class="nv-timer"></small></p>
            ${acts.map((a) => `<button type="button" class="kv-btn" data-act="${a.id}">${esc(a.label)}</button>`).join('')}
            <button type="button" class="cu-close" data-close>走开</button>
          </div>
        </div>`;
    }
    const soaking = st >= 4;
    const timer = this.closeup.querySelector('.nv-timer');
    if (timer) timer.textContent = soaking ? `泡了 ${soakedFor(s)} 分钟` : '';
    this.closeup.querySelector('.nv-scene')?.classList.toggle('hot', soaking && soakedFor(s) < 20);
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
    this.phone.innerHTML = `<div class="ph-frame">${bar}${body}<button type="button" class="ph-down" data-close>放下手机</button></div>`;
  }

  /** 技能栏：第一次做某件事时出现它的按钮。还在学是虚线框和进度，学会了是实心的，正在自动做时在呼吸。 */
  private renderSkills(s: GameState, now: number): void {
    const shownSkills = this.skills.filter((k) => isVisible(s, `act:${k.auto}`));
    const rows = shownSkills.map((k) => {
      const p = skillProgress(s, k);
      const done = learned(s, k);
      const running = s.ongoing?.actionId === k.auto;
      const blocked = done && !running && !this.canDo(s, k.auto);
      const isNew = (this.fresh.get(k.id) ?? 0) > now;
      return { k, p, done, running, blocked, isNew };
    });
    const key = rows.map((r) => `${r.k.id}:${r.p.have}/${r.p.need}:${r.done}:${r.running}:${r.blocked}:${r.isNew}`).join('|') + `|${this.panelSkill}`;
    if (key === this.lastSkillsKey) return;
    this.lastSkillsKey = key;
    this.skillsEl.innerHTML = rows
      .map((r) => {
        const cls = ['sk', r.done ? 'learned' : 'learning', r.running ? 'running' : '', r.isNew ? 'new' : ''].join(' ');
        const sub = r.done ? (r.running ? '做着呢' : '自动') : `${r.p.have}/${r.p.need}`;
        const bar = r.done ? '' : `<i class="sk-bar" style="--p:${r.p.have / r.p.need}"></i>`;
        return `<button type="button" class="${cls}" data-skill="${r.k.id}" ${r.blocked ? 'disabled' : ''}><b>${esc(r.k.name)}</b><small>${sub}</small>${bar}</button>`;
      })
      .join('');
    const sk = this.panelSkill && this.skills.find((x) => x.id === this.panelSkill);
    this.skillPanel.hidden = !sk;
    if (sk) {
      const conds = sk.conditions
        .map((c) => {
          const have = Math.min(c.need, c.have(s));
          return `<li class="${have >= c.need ? 'ok' : ''}"><span>${esc(c.label)}</span><em>${have}/${c.need}</em></li>`;
        })
        .join('');
      this.skillPanel.innerHTML = `<b>学会「${esc(sk.name)}」</b><ul>${conds}</ul><p>学会之后，点这个按钮他就自己做。</p>`;
    }
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
      if (learned(s, k)) this.celebrate(k.name);
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

  private celebrate(name: string): void {
    this.cheer.querySelector('b')!.textContent = `学会了 ${name}！`;
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

  render(s: GameState, paused: boolean, fastForward: boolean, ended: string | null): void {
    this.state = s;
    const now = performance.now();
    this.city.draw(s.t, now);
    this.winTime.textContent = hm(s.t);
    const day = daylight(s.t);
    this.dim.style.opacity = String(0.42 * (1 - day));
    this.sunPatch.style.opacity = String(0.22 * day);

    // 物件始终在场：能用时上色，不能用时灰。
    for (const o of this.objects) {
      const el = this.objs.get(o.id)!;
      el.classList.toggle('available', objectAvailable(s, this.content.actions, o.id, !!o.peek));
    }
    const unread = MESSAGES.some((m) => s.flags[`msg:${m.id}`] && !s.flags[`replied:${m.id}`]);
    this.objs.get('phone')?.classList.toggle('ping', unread && !s.ongoing?.occupies);

    // 桌上的那桶面：封着、撕开、泡着（盖着冒气）、揭开；正在吃时也在。
    const cur = s.ongoing ? this.actions.get(s.ongoing.actionId) : undefined;
    const pose = poseOf(s, this.content.actions);
    const st = stage(s);
    this.tableCup.hidden = !(st > 0 || pose === 'eat');
    this.tableCup.dataset.stage = String(st);
    this.tableCup.classList.toggle('hot', st >= 4 && soakedFor(s) < 20);
    const temp = k(s, 'temp');
    this.kettleFx.style.setProperty('--heat', String(k(s, 'water') > 0 ? Math.max(0, (temp - 55) / 45) : 0));
    this.kettleFx.classList.toggle('steaming', k(s, 'water') > 0 && temp >= 95);
    this.dispWater.style.setProperty('--level', String(dispenserWater(s) / vessel('dispenser').capacity));

    // 角色：正在做的事在哪个物件上，就站在那里；否则站在上次走到的地方。
    const x = cur && !cur.hands ? standAt(cur.object) : undefined;
    if (x !== undefined) this.charX = x;
    this.character.style.setProperty('--x', `${this.charX}%`);
    this.character.dataset.pose = pose || (this.view?.kind === 'screen' ? 'phone' : '');

    // 身体被占住（睡着）时，打开着的近景和屏幕都合上。
    if (this.view && s.ongoing?.occupies) this.view = null;
    if (this.view?.kind === 'closeup') this.renderCloseup(s);
    if (this.view?.kind === 'screen') this.renderPhone(s);
    this.closeup.hidden = this.view?.kind !== 'closeup';
    this.phone.hidden = this.view?.kind !== 'screen';

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

    this.status.hidden = !this.statusOpen;
    if (this.statusOpen) {
      const rows = this.content.bars.map((b) => {
        const style = levelStyle(b, s);
        const css = style ? `height:${style.thickness}px;background:${style.color}` : '';
        return `<div class="srow"><span>${b.name}</span><span class="bar-track" style="${style ? `height:${style.thickness}px` : ''}"><span class="bar-fill" style="width:${s.bars[b.id] ?? 0}%;${css}"></span></span></div>`;
      });
      const items = Object.entries(s.items)
        .filter(([, c]) => c > 0)
        .map(([id, c]) => `${ITEM_NAMES[id] ?? id} ×${c}`);
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

