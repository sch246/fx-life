// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件始终在房间里；能不能用由它身上的行动是否被规则挡住决定（见 core/rules 的 objectAvailable）。
// 位置用房间画面的百分比坐标。

export interface ObjectDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: 'window', name: '窗户', x: 58, y: 12, w: 26, h: 38 },
  { id: 'bed', name: '床', x: 4, y: 58, w: 30, h: 22 },
  { id: 'bag', name: '行李', x: 40, y: 68, w: 10, h: 12 },
  { id: 'phone', name: '手机', x: 26, y: 55, w: 4, h: 5 },
  { id: 'door', name: '门', x: 88, y: 26, w: 10, h: 46 },
];
