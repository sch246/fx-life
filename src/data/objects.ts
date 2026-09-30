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

export const OBJECTS: readonly ObjectDef[] = [];
