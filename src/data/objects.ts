// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件始终在房间里；能不能用由规则决定（见 core/rules 的 objectAvailable）。
// 点物件只是打开它（弹出能做的事，或者凑近看），不会直接替玩家做事。
// view：menu 弹出能做的事；closeup 凑近看，占住画面；screen 在画面右侧打开屏幕。
// 位置用房间画面的百分比坐标。

export interface ObjectDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view?: 'menu' | 'closeup' | 'screen';
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: 'window', name: '窗户', x: 50, y: 10, w: 30, h: 40 },
  { id: 'bed', name: '床', x: 3, y: 56, w: 32, h: 26 },
  { id: 'phone', name: '手机', x: 25, y: 59, w: 3.2, h: 4.5, view: 'screen' },
  { id: 'kettle', name: '水壶', x: 40.5, y: 55.5, w: 4.5, h: 7 },
  { id: 'bag', name: '行李箱', x: 58, y: 56, w: 9, h: 26, view: 'closeup' },
  { id: 'door', name: '门', x: 86, y: 22, w: 10, h: 50 },
];
