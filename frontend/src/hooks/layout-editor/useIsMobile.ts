/**
 * useIsMobile —— 窄屏判定（≤767px，触屏设备）。
 *
 * 画布拖拽/缩放依赖 moveable + 指针精度，窄屏体验差，A4Canvas 据此进入
 * 只读模式，重排块顺序交给 SortablePanel（dnd-kit 列表）。
 * 注意与 CSS 断点（editor.css 的 1023px）是两回事：那个管布局堆叠，
 * 这个管交互能力降级。
 */

import { useMediaQuery } from './useMediaQuery';

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
