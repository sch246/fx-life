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
  { lv: 1, name: '半死', thickness: 5, color: '#8fb0c8' },
  { lv: 2, name: '平常', thickness: 8, color: '#8fc3a0' },
  { lv: 3, name: '快乐', thickness: 10, color: '#e0b457' },
  { lv: 4, name: '幸福', thickness: 12, color: '#e88a5b' },
];

/** 第一代开局心情。 */
export const START_MOOD_LV = 0;

/** 升到第 i 级、降到第 i 级时事件流里的话。 */
export const MOOD_UP_LINES = ['', '好像能起来走走了。', '心情缓过来了一点。', '最近挺开心的。', '日子过得踏实，心里很安稳。'];
export const MOOD_DOWN_LINES = ['什么都不想做了。', '提不起劲，只想躺着。', '心情回到了平常。', '没有之前那么开心了。'];
