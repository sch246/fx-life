// 时钟：唯一的时间来源。
// - 现实 1 秒 = 游戏 1 分钟；快进（跳过）只是把倍率调高。
// - 暂停时冻结所有系统：不推进任何一分钟。
// - 系统按「一游戏分钟」逐步推进，所以快进和正常速度走的是同一条因果路径，
//   结果只取决于经过了多少分钟，不取决于倍率（不变量 2）。
// - 快进只减少玩家的现实等待，不删除角色经历的游戏时间：身体、天气、债务、持仓照常推进。
// - 某一步返回 true 时结束快进，并丢弃这一帧余下的分钟。
//   哪些事打断要和普通速度下的迹象、应对窗口一起设计，不是「凡需要注意都打断」；
//   界面元素浮现本身从不打断。

import { REAL_MS_PER_GAME_MIN } from './time';

/** 推进一游戏分钟。返回 true 表示发生了声明为打断快进的事。 */
export type StepFn = () => boolean | void;

/** 快进时每现实秒推进的游戏分钟数。 */
export const FAST_FORWARD_MIN_PER_SEC = 120;
/** 单帧最多推进的游戏分钟，防止标签页长时间挂起后一次性补算太多。 */
export const MAX_MIN_PER_FRAME = 240;

export class Clock {
  paused = false;
  fastForward = false;
  /** 尚未凑满一分钟的余量，单位是「现实毫秒 × 倍率」，攒满 1000 即一分钟。 */
  private carry = 0;

  constructor(private readonly step: StepFn) {}

  get minPerSec(): number {
    return this.fastForward ? FAST_FORWARD_MIN_PER_SEC : 1000 / REAL_MS_PER_GAME_MIN;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.carry = 0;
  }

  setFastForward(on: boolean): void {
    this.fastForward = on;
  }

  /** 由外部打断快进（例如玩家点了东西）。 */
  interrupt(): void {
    this.fastForward = false;
  }

  /**
   * 经过 realMs 现实毫秒。返回实际推进的游戏分钟数。
   */
  advance(realMs: number): number {
    if (this.paused || realMs <= 0) return 0;
    this.carry += realMs * this.minPerSec;
    let n = Math.floor(this.carry / 1000);
    this.carry -= n * 1000;
    if (n > MAX_MIN_PER_FRAME) {
      n = MAX_MIN_PER_FRAME;
      this.carry = 0;
    }
    for (let i = 0; i < n; i++) {
      if (this.step() === true && this.fastForward) {
        this.fastForward = false;
        this.carry = 0;
        return i + 1;
      }
    }
    return n;
  }
}
