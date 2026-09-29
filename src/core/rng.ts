// 可存档的随机数。每个独立过程（生活、行情、新闻……）用自己的一条流，
// 状态存在 GameState.rng 里。这样行情流的结果不可能因为生活里多掷了一次骰子而改变
// （不变量 2：市场永远不回应生活），读档后也能复现同一串结果。

export type RngStreams = Record<string, number>;

/** mulberry32 的一步：返回 [0,1) 的数和新的内部状态。 */
function step(s: number): [number, number] {
  s = (s + 0x6d2b79f5) | 0;
  let x = s;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, s];
}

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h | 0;
}

/** 由总种子为某条流派生初始状态。 */
export function seedStream(seed: number, name: string): number {
  return (seed ^ hashName(name)) | 0;
}

/** 从 streams[name] 取一个 [0,1) 的随机数并推进该流。流不存在时按 seed 创建。 */
export function rand(streams: RngStreams, seed: number, name: string): number {
  const cur = name in streams ? streams[name] : seedStream(seed, name);
  const [v, next] = step(cur);
  streams[name] = next;
  return v;
}
