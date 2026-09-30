// 心情五级。等级用条的粗细和颜色表示，玩家靠经历发现，不写成文字标签。

export const MOOD_NAMES = ['心死', '半死', '平常', '快乐', '幸福'] as const;

export const MOOD_STYLES = [
  { thickness: 2, color: '#6b6f76' },
  { thickness: 5, color: '#8fa9bd' },
  { thickness: 7, color: '#8fb3a0' },
  { thickness: 9, color: '#e0b457' },
  { thickness: 11, color: '#e88a5b' },
] as const;

/** 第一代开局心情。 */
export const START_MOOD_LV = 0;
