// 房间里的物件。房间就是菜单：交互入口是物件，不是按钮。
// 物件是否出现由 data/reveals 里 id 为 `obj:<id>` 的规则决定。
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
