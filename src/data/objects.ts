// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件始终在房间里；能不能用由规则决定（见 core/rules 的 objectAvailable）。
// 点物件只是打开它（弹出能做的事，或者凑近看），不会直接替玩家做事。
// view：menu 弹出能做的事；closeup 凑近看，占住画面；screen 在画面右侧打开屏幕。
// peek：随时能打开来看（行李箱、水壶、手机）；否则只在有能做的事时能用（小桌上有面时）。
// stand：角色做这个物件上的事时站在哪（角色左边缘的横坐标）。手机拿在手里，不用走过去。
// 位置用房间画面的百分比坐标。

export interface ObjectDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view?: 'menu' | 'closeup' | 'screen';
  peek?: boolean;
  stand?: number;
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: 'window', name: '窗户', x: 50, y: 10, w: 30, h: 40, stand: 62 },
  { id: 'bed', name: '床', x: 3, y: 56, w: 32, h: 26, stand: 22 },
  { id: 'phone', name: '手机', x: 25, y: 59, w: 3.2, h: 4.5, view: 'screen', peek: true },
  { id: 'table', name: '小桌', x: 38, y: 62, w: 11, h: 16, view: 'closeup', stand: 49.5 },
  { id: 'kettle', name: '水壶', x: 39.5, y: 55.5, w: 4.5, h: 7, view: 'closeup', peek: true, stand: 33 },
  { id: 'dispenser', name: '饮水机', x: 70, y: 46, w: 7, h: 32, stand: 64 },
  { id: 'bag', name: '行李箱', x: 58, y: 56, w: 9, h: 26, view: 'closeup', peek: true, stand: 52 },
  { id: 'door', name: '门', x: 86, y: 22, w: 10, h: 50, stand: 80 },
];

/** 角色站在哪里做这个物件上的事。 */
export const standAt = (id: string) => {
  const o = OBJECTS.find((x) => x.id === id);
  return o?.stand;
};
