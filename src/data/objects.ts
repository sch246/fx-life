// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件始终在房间里；能不能用由它身上的行动是否被规则挡住决定（见 core/rules 的 objectAvailable）。
// 位置用房间画面的百分比坐标；spot 是角色用这个物件时站（躺）的位置。

export interface ObjectDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  spot: { x: number; y: number };
  /** 第一次变得能用、染上颜色时写进事件流的话。开局就能用的不写。 */
  firstLine?: string;
}

export const OBJECTS: readonly ObjectDef[] = [
  { id: 'window', name: '窗户', x: 56, y: 10, w: 26, h: 40, spot: { x: 66, y: 46 } },
  { id: 'bed', name: '床', x: 3, y: 56, w: 31, h: 24, spot: { x: 12, y: 52 } },
  { id: 'phone', name: '手机', x: 26, y: 50, w: 6, h: 8, spot: { x: 24, y: 46 } },
  { id: 'bag', name: '行李', x: 38, y: 64, w: 12, h: 16, spot: { x: 44, y: 46 } },
  { id: 'sink', name: '水池', x: 56, y: 58, w: 11, h: 14, spot: { x: 58, y: 46 } },
  { id: 'door', name: '门', x: 86, y: 20, w: 11, h: 60, spot: { x: 82, y: 46 }, firstLine: '门边那双鞋，好像可以穿上了。' },
];
