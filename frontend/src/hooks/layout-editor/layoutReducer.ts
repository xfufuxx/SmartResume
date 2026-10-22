/**
 * 编辑器 reducer —— 纯函数，零 React 依赖，可单测（node:test 直接 import）。
 *
 * 历史策略：
 * - MOVE_BLOCK / RESIZE_BLOCK / SET_FREEDOM / BRING_FRONT / SEND_BACK /
 *   TOGGLE_LOCK / TOGGLE_VISIBLE / RESET_LAYOUT / APPLY_AUTOFIX /
 *   UPDATE_CONTENT（非编辑会话中）/ REORDER_BLOCK / MOVE_BLOCK_TO_PAGE /
 *   ADD_PAGE / REMOVE_PAGE / APPLY_TEMPLATE 入栈；
 * - 位置/文档无变化的 action 直接返回原 state（不污染历史）；
 * - SELECT_BLOCK / SET_ZOOM / TOGGLE_GRID / TOGGLE_ALIGN / START_EDIT /
 *   END_EDIT 是视图操作，不入栈；
 * - UPDATE_CONTENT 在编辑会话中（editingId === id）只替换当前 doc 不压栈：
 *   一次行内编辑 = 一步历史，否则每敲一个字都入栈会瞬间耗尽 50 步；
 * - 栈上限 HISTORY_LIMIT=50，超出丢最旧。
 *
 * 注意：本文件必须是 .ts（node 22 原生类型剥离不支持 .tsx 的 JSX），
 * React 封装（Context/Provider/hook）在 useLayoutStore.tsx。
 */

import type { BlockRect, DragFreedom, LayoutDocument } from '../../lib/layout/types.ts';
import { autoFixLayout } from '../../lib/layout/validate.ts';
import { reorderBlocks } from '../../lib/layout/reorder.ts';
import { addPage, moveBlockToPage, normalizePages, pageCountOf, removePage } from '../../lib/layout/paging.ts';
import { DEFAULT_TEMPLATE_ID, applyTemplate } from '../../lib/layout/templates.ts';
import { estimateContentHeightMm, OVERFLOW_MARGIN_MM } from '../../lib/layout/estimate.ts';
import { roundMm } from '../../lib/layout/geometry.ts';

/** 撤销栈上限（步），超出丢最旧 */
export const HISTORY_LIMIT = 50;

/** 缩放档位（桌面为主，三档） */
export const ZOOM_LEVELS = [1, 0.75, 0.5] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export interface EditorState {
  /** 当前布局文档 —— 唯一真相 */
  doc: LayoutDocument;
  /** 初始（载入/重置基准）文档 */
  initialDoc: LayoutDocument;
  selectedId: string | null;
  /** 正在行内编辑的块 id（视图态，不入历史栈） */
  editingId: string | null;
  /** 当前显示页（0 基，视图态）。页签切换用，不参与导出 */
  activePage: number;
  zoom: ZoomLevel;
  /** 网格吸附开关（默认关） */
  gridSnap: boolean;
  /** 对齐辅助开关（默认开） */
  alignAssist: boolean;
  /** 撤销栈（旧 → 新） */
  past: LayoutDocument[];
  /** 重做栈（新 → 旧） */
  future: LayoutDocument[];
  /** 有未保存修改 */
  dirty: boolean;
}

export type EditorAction =
  | { type: 'LOAD_LAYOUT'; doc: LayoutDocument }
  | { type: 'SELECT_BLOCK'; id: string | null }
  | { type: 'START_EDIT'; id: string }
  | { type: 'END_EDIT' }
  | { type: 'UPDATE_CONTENT'; id: string; payload: unknown }
  | { type: 'MOVE_BLOCK'; id: string; rect: BlockRect }
  | { type: 'RESIZE_BLOCK'; id: string; rect: BlockRect }
  | { type: 'SET_FREEDOM'; id: string; freedom: DragFreedom }
  | { type: 'BRING_FRONT'; id: string }
  | { type: 'SEND_BACK'; id: string }
  | { type: 'REORDER_BLOCK'; activeId: string; overId: string }
  /** 把块移到另一页（跨页移动，y 落到目标页内容底部之后） */
  | { type: 'MOVE_BLOCK_TO_PAGE'; id: string; targetPage: number }
  /** 页管理：末尾追加空页 / 删除空页 */
  | { type: 'ADD_PAGE' }
  | { type: 'REMOVE_PAGE'; page: number }
  /** 视图态：切换当前显示页 */
  | { type: 'SET_PAGE'; page: number }
  | { type: 'TOGGLE_LOCK'; id: string }
  | { type: 'TOGGLE_VISIBLE'; id: string }
  | { type: 'SET_ZOOM'; zoom: ZoomLevel }
  | { type: 'TOGGLE_GRID' }
  | { type: 'TOGGLE_ALIGN' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_LAYOUT' }
  | { type: 'APPLY_AUTOFIX' }
  | { type: 'MARK_SAVED' }
  /** 切换模板：按模板重排几何（applyTemplate），入历史栈可撤销 */
  | { type: 'APPLY_TEMPLATE'; templateId: string };
// ============ 内部工具 ============

/** 文档级比较：结构相同视为无变化（rect 均已 roundMm，可直接 JSON 比对） */
function sameDoc(a: LayoutDocument, b: LayoutDocument): boolean {
  if (a === b) return true;
  if (a.pageCount !== b.pageCount) return false; // 纯页数变化（如 ADD_PAGE）也要感知
  if (a.gap !== b.gap) return false;
  if (a.blocks.length !== b.blocks.length) return false;
  for (let i = 0; i < a.blocks.length; i++) {
    if (JSON.stringify(a.blocks[i]) !== JSON.stringify(b.blocks[i])) return false;
  }
  return true;
}

/** 撤销/重做/删页后 activePage 可能越界，钳回最后一页 */
function withClampedPage(state: EditorState, doc: LayoutDocument): EditorState {
  const max = pageCountOf(doc) - 1;
  if (state.activePage <= max) return state;
  return { ...state, activePage: max };
}

/** 入栈提交新文档；无变化则原样返回 */
function commitDoc(state: EditorState, nextDoc: LayoutDocument): EditorState {
  if (sameDoc(state.doc, nextDoc)) return state;
  return {
    ...state,
    doc: nextDoc,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  };
}

/** 深拷贝 doc 并按 id 更新 block（找不到 id 返回原 doc） */
function updateBlock(
  doc: LayoutDocument,
  id: string,
  updater: (block: LayoutDocument['blocks'][number]) => void,
): LayoutDocument {
  const next: LayoutDocument = JSON.parse(JSON.stringify(doc));
  const block = next.blocks.find((b) => b.id === id);
  if (!block) return doc;
  updater(block);
  return next;
}

function cloneDoc(doc: LayoutDocument): LayoutDocument {
  return JSON.parse(JSON.stringify(doc)) as LayoutDocument;
}

// ============ 对外纯函数 ============

export function createInitialState(doc: LayoutDocument): EditorState {
  const normalized = normalizePages(doc);
  // 旧存档无 template 字段：补默认模板 id，保存时一并持久化
  const withTemplate: LayoutDocument =
    normalized.template === undefined ? { ...normalized, template: DEFAULT_TEMPLATE_ID } : normalized;
  return {
    doc: withTemplate,
    initialDoc: withTemplate,
    selectedId: null,
    editingId: null,
    activePage: 0,
    zoom: 1,
    gridSnap: false,
    alignAssist: true,
    past: [],
    future: [],
    dirty: false,
  };
}

export function layoutReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD_LAYOUT':
      return createInitialState(action.doc);

    case 'SELECT_BLOCK': {
      // 切换到别的块（或取消选中）时退出编辑；点中的就是正在编辑的块则保持
      const nextEditing =
        state.editingId !== null && state.editingId !== action.id ? null : state.editingId;
      if (state.selectedId === action.id && nextEditing === state.editingId) return state;
      return { ...state, selectedId: action.id, editingId: nextEditing };
    }

    case 'START_EDIT':
      if (state.editingId === action.id) return state;
      // 编辑会话基线入栈：撤销一次即可回到编辑前（修改本身不压栈，
      // 见 UPDATE_CONTENT）。dirty 不置位——一字未改就退出时，
      // END_EDIT 会把这份基线弹掉，不留无意义历史。
      return {
        ...state,
        editingId: action.id,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
      };

    case 'END_EDIT': {
      if (state.editingId === null) return state;
      const top = state.past[state.past.length - 1];
      // 一字未改：弹掉基线快照，恢复无历史、无脏标志的干净状态
      if (top && sameDoc(top, state.doc)) {
        return {
          ...state,
          editingId: null,
          past: state.past.slice(0, -1),
          dirty: state.past.length > 1,
        };
      }
      return { ...state, editingId: null };
    }

    case 'UPDATE_CONTENT': {
      const nextDoc = updateBlock(state.doc, action.id, (b) => {
        b.contentRef = { ...b.contentRef, payload: action.payload };
        // 内容变了 → 按 validate 同一口径重估高度；只长高不压低：
        // 用户手动拖高的块保留空间，内容变多则保证不被裁
        const need = estimateContentHeightMm(b);
        if (need + OVERFLOW_MARGIN_MM > b.rect.h) {
          b.rect.h = roundMm(need + OVERFLOW_MARGIN_MM);
        }
      });
      if (sameDoc(state.doc, nextDoc)) return state;
      // 编辑会话中的连续输入：替换当前 doc 而不压栈 —— 一次编辑 = 一步历史，
      // 否则每敲一个字符都入栈，50 步撤销瞬间耗尽
      if (state.editingId === action.id) {
        return { ...state, doc: nextDoc, dirty: true };
      }
      return commitDoc(state, nextDoc);
    }

    case 'MOVE_BLOCK':
    case 'RESIZE_BLOCK':
      return commitDoc(
        state,
        updateBlock(state.doc, action.id, (b) => {
          b.rect = action.rect;
        }),
      );

    case 'SET_FREEDOM':
      return commitDoc(
        state,
        updateBlock(state.doc, action.id, (b) => {
          b.freedom = action.freedom;
          if (action.freedom === 'locked') b.locked = true;
          else if (b.locked) delete b.locked;
        }),
      );

    case 'BRING_FRONT': {
      const idx = state.doc.blocks.findIndex((b) => b.id === action.id);
      if (idx < 0 || idx === state.doc.blocks.length - 1) return state;
      const next = cloneDoc(state.doc);
      const [moved] = next.blocks.splice(idx, 1);
      next.blocks.push(moved); // 数组顺序 = 层级，后者在上
      return commitDoc(state, next);
    }

    case 'SEND_BACK': {
      const idx = state.doc.blocks.findIndex((b) => b.id === action.id);
      if (idx <= 0) return state;
      const next = cloneDoc(state.doc);
      const [moved] = next.blocks.splice(idx, 1);
      next.blocks.unshift(moved);
      return commitDoc(state, next);
    }

    // 移动端排序（dnd-kit）：reorderBlocks 同时改数组顺序、page 与 y，
    // 一步完成（顺序换了 y 不变会和视觉脱钩）。无变化时 reorder
    // 返回原引用，sameDoc 短路，不污染历史。
    case 'REORDER_BLOCK':
      return commitDoc(state, reorderBlocks(state.doc, action.activeId, action.overId));

    // 跨页移动：moveBlockToPage 改 page + y 落位；成功后视图切到目标页
    case 'MOVE_BLOCK_TO_PAGE': {
      const next = commitDoc(state, moveBlockToPage(state.doc, action.id, action.targetPage));
      if (next === state) return state;
      return { ...next, activePage: action.targetPage };
    }

    case 'ADD_PAGE': {
      const next = commitDoc(state, addPage(state.doc));
      if (next === state) return state;
      // 追加的空页在末尾，切过去让用户直接看到新页
      return { ...next, activePage: pageCountOf(next.doc) - 1 };
    }

    case 'REMOVE_PAGE': {
      const next = commitDoc(state, removePage(state.doc, action.page));
      if (next === state) return state;
      return withClampedPage(next, next.doc);
    }

    case 'SET_PAGE': {
      const count = pageCountOf(state.doc);
      const page = Math.max(0, Math.min(Math.trunc(action.page), count - 1));
      return state.activePage === page ? state : { ...state, activePage: page };
    }

    case 'TOGGLE_LOCK':
      return commitDoc(
        state,
        updateBlock(state.doc, action.id, (b) => {
          b.locked = !b.locked;
        }),
      );

    case 'TOGGLE_VISIBLE':
      return commitDoc(
        state,
        updateBlock(state.doc, action.id, (b) => {
          b.visible = b.visible === false ? true : false;
        }),
      );

    case 'SET_ZOOM':
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };

    case 'TOGGLE_GRID':
      return { ...state, gridSnap: !state.gridSnap };

    case 'TOGGLE_ALIGN':
      return { ...state, alignAssist: !state.alignAssist };

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return withClampedPage(
        {
          ...state,
          doc: previous,
          past: state.past.slice(0, -1),
          future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
          editingId: null,
        },
        previous,
      );
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return withClampedPage(
        {
          ...state,
          doc: next,
          past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          dirty: true,
          editingId: null,
        },
        next,
      );
    }

    case 'RESET_LAYOUT': {
      const next = commitDoc(state, cloneDoc(state.initialDoc));
      // 无变化时 commitDoc 原样返回 state——保持引用相等（既有测试依赖），
      // 只在真的退出编辑时才包一层
      const reset = state.editingId === null ? next : { ...next, editingId: null };
      // 重置回初始文档：视图也回到第 1 页
      return reset === state ? state : { ...reset, activePage: 0 };
    }

    case 'APPLY_AUTOFIX': {
      const { doc: fixed } = autoFixLayout(state.doc);
      return commitDoc(state, fixed);
    }

    // 模板切换：applyTemplate 保留块顺序/内容，按模板重排几何与分页。
    // classic → classic 在默认布局上幂等（sameDoc 短路，不入栈）；
    // 其余切换一定进历史栈，Ctrl+Z 可回到切换前的手调结果。
    case 'APPLY_TEMPLATE': {
      const next = commitDoc(state, applyTemplate(state.doc, action.templateId));
      if (next === state) return state;
      // 页数与几何全变，视图回第 1 页，避免 activePage 指向陌生页
      return { ...next, activePage: 0 };
    }

    case 'MARK_SAVED':
      // 持久化成功后的脏标志清理；不影响历史栈
      return state.dirty ? { ...state, dirty: false } : state;

    default:
      return state;
  }
}
