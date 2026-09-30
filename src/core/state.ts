// 状态：一个纯数据、可序列化的对象。存档、读档、结算回放都只依赖它。
// 不要在这里放函数、DOM 引用或类实例。

import type { FeedLine } from './feed';
import type { RevealState } from './reveal';
import type { RecordState } from './record';
import type { RngStreams } from './rng';
import { at } from './time';

export const SAVE_VERSION = 1;

/** 账本条目。所有钱的变动都记在这里（不变量 4：结果可以回溯）。 */
export interface LedgerEntry {
  t: number;
  amount: number;
  reason: string;
  cat: string;
}

/** 正在进行的行动（持续型，例如睡觉）。 */
export interface Ongoing {
  actionId: string;
  start: number;
  /** 预定结束时间；undefined 表示直到被打断或手动停止。 */
  until?: number;
  /** 身体被这件事占住（例如睡着）：别的事都做不了，只能先停下它。 */
  occupies?: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: RngStreams;
  /** 当前游戏时间（游戏分钟）。 */
  t: number;
  /** 各根条，0–100。哪些条存在由 data/bars 决定。 */
  bars: Record<string, number>;
  /** 各根条的等级（例如心情 0–4：心死、半死、平常、快乐、幸福）。哪些条分级由 data/bars 决定。 */
  levels: Record<string, number>;
  money: number;
  /** 长期积累：技能、回忆、纪念物计数等。 */
  accum: Record<string, number>;
  /** 物品及数量（例如泡面包数）。 */
  items: Record<string, number>;
  /** 一次性标记：发生过的事、已发出的消息等。 */
  flags: Record<string, true>;
  /** 物件自己的状态（水壶里的水和温度、桌上泡着的面……），键是「物件.属性」。 */
  things: Record<string, number>;
  /** 各行动上一次给「手动」心情的时间，防止反复点同一件事刷心情。 */
  cooldowns: Record<string, number>;
  ongoing: Ongoing | null;
  reveal: RevealState;
  feed: FeedLine[];
  ledger: LedgerEntry[];
  record: RecordState;
}

export interface NewStateOptions {
  seed?: number;
  /** 开局时间，默认第 1 天 18:00。 */
  t?: number;
  bars?: Record<string, number>;
  levels?: Record<string, number>;
  money?: number;
  items?: Record<string, number>;
  things?: Record<string, number>;
}

export function createState(o: NewStateOptions = {}): GameState {
  const t = o.t ?? at(1, 18);
  return {
    version: SAVE_VERSION,
    seed: o.seed ?? (Math.random() * 2 ** 31) | 0,
    rng: {},
    t,
    bars: { ...(o.bars ?? {}) },
    levels: { ...(o.levels ?? {}) },
    money: o.money ?? 0,
    accum: {},
    items: { ...(o.items ?? {}) },
    flags: {},
    things: { ...(o.things ?? {}) },
    cooldowns: {},
    ongoing: null,
    reveal: { visible: {}, seen: {}, hideSince: {} },
    feed: [],
    ledger: [],
    record: { samples: [], lastSampleT: -Infinity },
  };
}

export function serialize(s: GameState): string {
  return JSON.stringify(s, (_k, v) => (v === -Infinity ? '-Infinity' : v));
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json, (_k, v) => (v === '-Infinity' ? -Infinity : v)) as GameState;
  if (s.version !== SAVE_VERSION) throw new Error(`不支持的存档版本 ${s.version}`);
  return s;
}
