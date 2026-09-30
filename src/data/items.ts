// 带在身上的东西。房间里的物件放在哪就在哪；带在身上的跟着人走，到哪都能拿出来。
// 以后出门、换地方，身上的还在，房间里的留在房间里。
// 有没有、有几个，和行李箱里的面记在同一本数里（s.items）：数到 0 就是不在身上了。
// 身上的东西画在房间左下角的一栏里，点一下拿出来（view 同 data/objects）。

import type { GameState } from '../core/state';

export interface CarriedDef {
  id: string;
  name: string;
  view: 'screen';
}

export const CARRIED: readonly CarriedDef[] = [{ id: 'phone', name: '手机', view: 'screen' }];

export const carrying = (s: GameState, id: string) => (s.items[id] ?? 0) > 0;
