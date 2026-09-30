// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件始终在房间里；能不能用由规则决定（见 core/rules 的 objectAvailable）。
// 点物件只是打开它（弹出能做的事，或者凑近看），不会直接替玩家做事。
// view：menu 弹出能做的事；closeup 凑近看，占住画面；screen 在画面右侧打开屏幕。
// peek：随时能打开来看（行李箱、水壶）；否则只在有能做的事时能用（小桌上有面时）。
// stand：角色做这个物件上的事时站在哪（角色左边缘的横坐标 x、脚的纵坐标 y）。
// on：放在另一个物件上（水壶在小桌上），画在它上面一层。
// 手机不在这里：它带在人身上，见 data/items。
// 远近：地板上的东西按底边的高低排前后，脚越靠画面下方越在前面。墙上的窗户在最后面。
// 位置用房间画面的百分比坐标。

export interface Spot {
  x: number;
  y: number;
}

export interface ObjectDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view?: 'menu' | 'closeup' | 'screen';
  peek?: boolean;
  stand?: Spot;
  on?: string;
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: 'window', name: '窗户', x: 50, y: 10, w: 30, h: 40, stand: { x: 62, y: 77 } },
  // 屋顶垂下来的一只灯泡，拉线开关：站到底下，伸手拉一下。
  { id: 'lamp', name: '灯', x: 28.5, y: 0, w: 4, h: 50, stand: { x: 28, y: 85 } },
  { id: 'bed', name: '床', x: 3, y: 56, w: 32, h: 26, stand: { x: 22, y: 86 } },
  { id: 'table', name: '小桌', x: 38, y: 62, w: 11, h: 16, view: 'closeup', stand: { x: 49.5, y: 80 } },
  { id: 'kettle', name: '水壶', x: 39.5, y: 55.5, w: 4.5, h: 7, view: 'closeup', peek: true, stand: { x: 33, y: 80 }, on: 'table' },
  { id: 'dispenser', name: '饮水机', x: 70, y: 46, w: 7, h: 32, stand: { x: 64, y: 80 } },
  { id: 'bag', name: '行李箱', x: 58, y: 56, w: 9, h: 26, view: 'closeup', peek: true, stand: { x: 52, y: 85 } },
  { id: 'door', name: '门', x: 86, y: 22, w: 10, h: 50, stand: { x: 80, y: 75 } },
];

const byId = (id: string) => OBJECTS.find((o) => o.id === id);

/** 角色站在哪里做这个物件上的事。 */
export const standAt = (id: string): Spot | undefined => byId(id)?.stand;

/** 脚（或底边）在这个高度时画在第几层。 */
export const layerAt = (bottom: number) => 10 + Math.round(bottom * 4);

/** 物件画在第几层：放在别的东西上的，比它高两层（中间留给躺在床上的人）。 */
export function layerOf(id: string): number {
  const o = byId(id)!;
  return o.on ? layerOf(o.on) + 2 : layerAt(o.y + o.h);
}
