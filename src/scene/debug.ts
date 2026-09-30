// 调试用的身体模型快照：?debug 或按 ` 打开，显示在右下角。
// 它只读 state 和 data/body 的表，回答试玩时最想问的那几个问题：
// "这根条现在在哪个带？为什么现在冒出来？哪些后果正在生效？离下一个边界还有多远？"
// 不进入游戏逻辑，不参与存档。它读 data/ 的表，所以放在场景这一侧，不放在只管统一规则的 core/。

import type { GameState } from '../core/state';
import { activeBands, BANDS, EFFECTS } from '../data/body';
import { isVisible } from '../core/reveal';
import { stamp } from '../core/time';

const r = (n: number) => Math.round(n);

/** 离这根条最近的一个边界（还没到的那个）。 */
function nextEdge(s: GameState, barId: string): string {
  const v = s.bars[barId] ?? 0;
  let best: { d: number; text: string } | null = null;
  for (const b of BANDS.filter((x) => x.bar === barId)) {
    const inNow = b.dir === 'below' ? v < b.at : v >= b.at;
    if (inNow) return `已在 ${b.dir === 'below' ? '<' : '>='}${b.at}`;
    const d = b.dir === 'below' ? v - b.at : b.at - v;
    if (d >= 0 && (!best || d < best.d)) best = { d, text: `${b.dir === 'below' ? '<' : '>='}${b.at}` };
  }
  return best ? `距 ${best.text} 还有 ${r(best.d)}` : '—';
}

export function debugEnabled(): boolean {
  return new URLSearchParams(location.search).has('debug');
}

export function debugText(s: GameState, paused: boolean): string {
  const out: string[] = [];
  out.push(`${stamp(s.t)}  ${paused ? '暂停' : '走'}  心情 lv${s.levels.mood ?? 0}  体能 lv${s.levels.fitness ?? 0}  精力 lv${s.levels.energy ?? 0}`);
  out.push(`进行中 ${s.ongoing?.actionId ?? '—'}   后台 ${s.tasks.map((t) => t.actionId).join(',') || '—'}   面 ${s.items.noodles ?? 0}`);
  out.push('─ 条 ─────────────────────────────────────────');
  for (const id of Object.keys(s.bars)) {
    const v = s.bars[id] ?? 0;
    const shown = isVisible(s, `bar:${id}`) ? '●' : '·';
    const bands = activeBands(s, id).map((b) => b.note).join('；') || '正常带';
    const eff = EFFECTS.filter((e) => e.bar === id && e.when(s))
      .map((e) => `${e.perHour > 0 ? '+' : ''}${e.perHour}/h ${e.note}`)
      .join(' | ');
    out.push(`${id.padEnd(8)} ${r(v).toString().padStart(3)} ${shown}  ${bands}`);
    if (eff) out.push(`         ↳ ${eff}`);
    out.push(`         ${nextEdge(s, id)}`);
  }
  return out.join('\n');
}
