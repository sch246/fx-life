// 心情五级。等级用条的粗细和颜色表示，玩家靠经历发现，不写成文字标签。

export interface MoodLevel {
  lv: number;
  name: string;
  /** 心情条的粗细（px）与颜色。 */
  thickness: number;
  color: string;
}

export const MOOD_LEVELS: readonly MoodLevel[] = [
  { lv: 0, name: '心死', thickness: 2, color: '#6b6f76' },
  { lv: 1, name: '半死', thickness: 4, color: '#8a9aa8' },
  { lv: 2, name: '平常', thickness: 6, color: '#8fb3a0' },
  { lv: 3, name: '快乐', thickness: 8, color: '#e0b457' },
  { lv: 4, name: '幸福', thickness: 10, color: '#e88a5b' },
];

/** 第一代开局心情。 */
export const START_MOOD_LV = 0;
