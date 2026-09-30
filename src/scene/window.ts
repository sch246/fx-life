// 窗外：城市的楼群、万家灯火、路灯、月亮和星星。纯绘制，只读游戏时间。
// 布局用固定种子生成，每次打开都是同一片街区（这是画面的随机，不是规则的随机）。

import { daylight, minuteOfDay } from '../core/time';
import { skyColor, lightsOn } from './sky';

interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 这扇窗在灯火比例超过多少时亮。 */
  on: number;
  warm: boolean;
}

interface Building {
  x: number;
  w: number;
  h: number;
  near: boolean;
  wins: Win[];
  tank?: boolean;
  antenna?: boolean;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c: number[], a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const parse = (s: string) => s.match(/\d+/g)!.slice(0, 3).map(Number);

function makeCity(): { buildings: Building[]; stars: [number, number, number][] } {
  const r = lcg(20260929);
  const buildings: Building[] = [];
  // 远处一排，近处一排；坐标都是 0–1 的比例。
  for (const near of [false, true]) {
    let x = -0.05;
    while (x < 1.05) {
      const w = near ? 0.16 + r() * 0.16 : 0.07 + r() * 0.09;
      const h = near ? 0.22 + r() * 0.3 : 0.3 + r() * 0.32;
      const b: Building = { x, w, h, near, wins: [], tank: near && r() < 0.4, antenna: !near && r() < 0.25 };
      const cols = Math.max(2, Math.floor(w / (near ? 0.035 : 0.022)));
      const rows = Math.max(3, Math.floor(h / (near ? 0.06 : 0.035)));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (r() < 0.12) continue;
          b.wins.push({
            x: (i + 0.25) / cols,
            y: (j + 0.3) / rows,
            w: 0.5 / cols,
            h: 0.45 / rows,
            on: r(),
            warm: r() < 0.8,
          });
        }
      buildings.push(b);
      x += w + (near ? 0.01 + r() * 0.03 : 0.004 + r() * 0.01);
    }
  }
  const stars: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) stars.push([r(), r() * 0.4, r() * Math.PI * 2]);
  return { buildings, stars };
}

const CITY = makeCity();

export class CityView {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  draw(t: number, realMs: number): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr);
    const H = Math.round(c.clientHeight * dpr);
    if (!W || !H) return;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = this.ctx;
    const day = daylight(t);
    const night = 1 - day;
    const lit = lightsOn(t);

    // 天空：城市夜里的天边被灯光映成暗橙色。
    const top = parse(skyColor(t));
    const horizon = mix(mix(top, [230, 225, 215], 0.35 * day), [92, 58, 64], 0.55 * night);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(1, rgb(horizon));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // 星星：城里只看得见最亮的几颗。
    if (day < 0.15) {
      const k = 1 - day / 0.15;
      for (const [x, y, ph] of CITY.stars) {
        const a = k * (0.35 + 0.35 * Math.sin(realMs / 900 + ph * 3));
        g.fillStyle = `rgba(235, 238, 255, ${a})`;
        g.fillRect(x * W, y * H, Math.max(1, dpr), Math.max(1, dpr));
      }
    }

    // 月亮：傍晚从东边升起，清晨在西边落下。
    const m = minuteOfDay(t) / 60;
    const p = (((m - 17.5 + 24) % 24) / 13.5);
    if (p >= 0 && p <= 1) {
      const mx = (0.12 + 0.76 * p) * W;
      const my = (0.48 - 0.36 * Math.sin(Math.PI * p)) * H;
      const R = 0.06 * H;
      const a = Math.max(0.12, 1 - day * 0.85);
      const glow = g.createRadialGradient(mx, my, R * 0.5, mx, my, R * 3.2);
      glow.addColorStop(0, `rgba(245, 238, 210, ${0.25 * a})`);
      glow.addColorStop(1, 'rgba(245, 238, 210, 0)');
      g.fillStyle = glow;
      g.fillRect(mx - R * 4, my - R * 4, R * 8, R * 8);
      g.fillStyle = `rgba(243, 236, 214, ${a})`;
      g.beginPath();
      g.arc(mx, my, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(190, 182, 160, ${0.35 * a})`;
      g.beginPath();
      g.arc(mx - R * 0.3, my - R * 0.2, R * 0.28, 0, Math.PI * 2);
      g.arc(mx + R * 0.35, my + R * 0.3, R * 0.18, 0, Math.PI * 2);
      g.fill();
    }

    // 楼群：远处一排颜色浅一些，近处一排更暗、更大。
    const farColor = mix([24, 28, 42], [132, 146, 168], day);
    const nearColor = mix([13, 15, 23], [98, 108, 126], day);
    for (const b of CITY.buildings) {
      const bx = b.x * W;
      const bw = b.w * W;
      const bh = b.h * H;
      const by = H - bh;
      g.fillStyle = rgb(b.near ? nearColor : farColor);
      g.fillRect(bx, by, bw, bh);
      if (b.tank) {
        g.fillRect(bx + bw * 0.6, by - bh * 0.08, bw * 0.18, bh * 0.08);
      }
      if (b.antenna) {
        g.fillRect(bx + bw * 0.45, by - bh * 0.18, Math.max(1, dpr), bh * 0.18);
        if (night > 0.3 && Math.floor(realMs / 700) % 2 === 0) {
          g.fillStyle = 'rgba(255, 70, 60, 0.9)';
          g.fillRect(bx + bw * 0.45 - dpr, by - bh * 0.18 - dpr, 3 * dpr, 3 * dpr);
        }
      }
      for (const w of b.wins) {
        const on = w.on < lit * (b.near ? 0.7 : 0.85);
        if (on) g.fillStyle = w.warm ? 'rgba(255, 206, 120, 0.92)' : 'rgba(190, 215, 255, 0.85)';
        else g.fillStyle = rgb(mix(b.near ? nearColor : farColor, [0, 0, 0], 0.25 + 0.1 * night));
        g.fillRect(bx + w.x * bw, by + w.y * bh, Math.max(1, w.w * bw), Math.max(1, w.h * bh));
      }
    }

    // 街上的路灯把楼底映亮。
    if (night > 0.2) {
      const street = g.createLinearGradient(0, H * 0.8, 0, H);
      street.addColorStop(0, 'rgba(255, 170, 90, 0)');
      street.addColorStop(1, `rgba(255, 170, 90, ${0.28 * night})`);
      g.fillStyle = street;
      g.fillRect(0, H * 0.8, W, H * 0.2);
    }
  }
}
