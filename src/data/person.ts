// 这个人是谁：开局由玩家挑称呼、发型和一套衣服。
// 只是样子和称呼，不进任何规则：选谁都过同一套日子。以后换装（买衣服）也从这张表往下长。

import type { GameState } from '../core/state';

export interface PersonOption {
  id: string;
  name: string;
}

export interface Outfit extends PersonOption {
  top: string;
  /** 裤子的颜色；穿裙子时是腿（袜子）的颜色。 */
  legs: string;
  shoes: string;
  skirt?: string;
}

export const SKIN = '#dcbfa0';
export const HAIR_COLOR = '#2b2420';

export const PRONOUNS: readonly PersonOption[] = [
  { id: 'he', name: '他' },
  { id: 'she', name: '她' },
];

export const HAIRS: readonly PersonOption[] = [
  { id: 'short', name: '短发' },
  { id: 'long', name: '长发' },
  { id: 'bun', name: '丸子头' },
];

export const OUTFITS: readonly Outfit[] = [
  { id: 'hoodie', name: '灰卫衣', top: '#616b7a', legs: '#363b45', shoes: '#e6e2da' },
  { id: 'tee', name: '白T恤', top: '#ece7dc', legs: '#4b6e93', shoes: '#2e3138' },
  { id: 'sweater', name: '红毛衣', top: '#b35a4c', legs: '#4f4338', shoes: '#2e3138' },
  { id: 'dress', name: '连衣裙', top: '#7d93ad', skirt: '#7d93ad', legs: '#3a3533', shoes: '#6b3f35' },
];

/** 开局能挑的几样，按这个顺序列出来。 */
export const PERSON_PARTS: readonly { id: string; name: string; options: readonly PersonOption[] }[] = [
  { id: 'pronoun', name: '称呼', options: PRONOUNS },
  { id: 'hair', name: '发型', options: HAIRS },
  { id: 'outfit', name: '衣服', options: OUTFITS },
];

export const DEFAULT_PERSON: Record<string, string> = { pronoun: 'he', hair: 'short', outfit: 'hoodie' };

export const pronoun = (s: GameState) => PRONOUNS.find((p) => p.id === s.person.pronoun)?.name ?? '他';
export const outfit = (s: GameState) => OUTFITS.find((o) => o.id === s.person.outfit) ?? OUTFITS[0];
