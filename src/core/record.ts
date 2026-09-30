// 记录：从第一天起按时间记下结算需要的数据。
// 结算页只从这里和账本读，不在结算时临时推算过去（不变量 4）。

import type { GameState } from './state';
import { MIN_PER_HOUR } from './time';

export interface Sample {
  t: number;
  bars: Record<string, number>;
  levels: Record<string, number>;
  money: number;
}

export interface RecordState {
  samples: Sample[];
  lastSampleT: number;
}

/** 采样间隔（游戏分钟）。 */
export const SAMPLE_EVERY_MIN = MIN_PER_HOUR;

export function stepRecord(s: GameState): void {
  const r = s.record;
  if (s.t - r.lastSampleT < SAMPLE_EVERY_MIN) return;
  r.samples.push({ t: s.t, bars: { ...s.bars }, levels: { ...s.levels }, money: s.money });
  r.lastSampleT = s.t;
}
