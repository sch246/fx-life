// 显隐规则表。id 约定：`bar:<条>`、`act:<动作>`。
// 状态条的浮现点不在这里手写，而是从 data/body.ts 的后果带派生：
// 一根条在"第一个真实后果"出现时浮现，回到安全线以上并稳定 holdMinutes 才淡出。
// 浮现永远和代价挂钩——想让条更早出现，去 body.ts 加一条能被玩家感知的后果，而不是改阈值。
// 另一个浮现的理由是变化正在发生：正在做的事让这根条随时间涨落（睡觉时精力往上涨），条就浮现，
// 做完后照常按后果带淡出。这对每根条、每件事都一样，不是精力或睡觉的特例。
// 窗户、角色、事件流、暂停和房间里的物件都是常驻元素，不在这里。
// 没有显隐规则的动作一直在菜单里（能不能做由行动规则决定）。

import type { GameState } from '../core/state';
import type { RevealRule } from '../core/reveal';
import { moodLv } from '../core/rules';
import { barValue, inBand, revealBands, type BandDef } from './body';
import { BARS } from './bars';
import { SKILLS } from './skills';
import { ACTIONS } from './actions';

/** 正在做的事让这根条随时间变化（每小时的效果里有它）。 */
const changing = (s: GameState, barId: string) => {
  const id = s.ongoing?.actionId;
  const a = id ? ACTIONS.find((x) => x.id === id) : undefined;
  return !!a?.perHour?.bars?.[barId];
};

/**
 * 一根条的浮现规则：所有标了 reveal 的带任一成立，或者正在做的事让它变化，就浮现；
 * 不再变化、且落到所有带的 hideAt 之外并稳定后才淡出。
 */
function barReveal(barId: string, bands: readonly BandDef[]): RevealRule {
  const showWhen = (s: GameState) => changing(s, barId) || bands.some((b) => inBand(s, b));
  const hideWhen = (s: GameState) =>
    !changing(s, barId) &&
    bands.every((b) =>
      b.hideAt === undefined
        ? !inBand(s, b)
        : b.dir === 'below'
          ? barValue(s, b.bar) > b.hideAt
          : barValue(s, b.bar) < b.hideAt,
    );
  const hold = Math.max(...bands.map((b) => b.holdMinutes ?? 0));
  // 带上的那句话（「累了。」）跟着后果走，写在 data/cues：条因为正在变化先浮现了，这句话也要等真的进了带才说。
  return { id: `bar:${barId}`, showWhen, hideWhen, holdMinutes: hold };
}

/** 从后果带里挑出需要浮现那些条。 */
const BAR_REVEALS: RevealRule[] = BARS.flatMap((b) => {
  const bands = revealBands(b.id);
  return bands.length ? [barReveal(b.id, bands)] : [];
});

export const REVEALS: readonly RevealRule[] = [
  ...BAR_REVEALS,
  // 技能栏：第一次做这件事时出现它的按钮，之后一直留着（学会之前点它看要怎样才算会）。
  ...SKILLS.map((k): RevealRule => ({ id: `act:${k.auto}`, showWhen: k.seenWhen })),
  // 升到 lv1 后浮现的新动作。发现后一直留着。
  { id: 'act:unpack', showWhen: (s) => moodLv(s) >= 1 },
  // 睡眠跳过依赖可失去的条件：掉回 lv0 就消失。
  { id: 'act:sleep-skip', showWhen: (s) => moodLv(s) >= 1, hideWhen: (s) => moodLv(s) < 1 },
];

/** 开局即可见的元素。心情是主线，一开始就在，一直显示。 */
export const REVEALED_AT_START: readonly string[] = ['bar:mood'];
