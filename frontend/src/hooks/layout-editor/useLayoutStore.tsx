/**
 * 编辑器 React 封装 —— Context + Provider + hook。
 * reducer 纯函数在 layoutReducer.ts（可单测），本文件只做装配。
 */

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

import type { LayoutDocument } from '../../lib/layout/types.ts';
import { LAYOUT_VERSION } from '../../lib/layout/types.ts';
import { validateLayout } from '../../lib/layout/validate.ts';
import type { EditorAction, EditorState } from './layoutReducer.ts';
import { createInitialState, layoutReducer } from './layoutReducer.ts';

// 纯函数与类型从 layoutReducer 再导出，组件层单点 import
export * from './layoutReducer.ts';

interface StoreValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const LayoutStoreContext = createContext<StoreValue | null>(null);

export interface LayoutEditorProviderProps {
  /** 初始布局文档（通常是 parseLayout(db) ?? buildLayout(optimized_json) 的结果） */
  initialDoc: LayoutDocument;
  children: ReactNode;
}

export function LayoutEditorProvider({ initialDoc, children }: LayoutEditorProviderProps) {
  const [state, dispatch] = useReducer(layoutReducer, initialDoc, createInitialState);
  const value = useMemo<StoreValue>(() => ({ state, dispatch }), [state]);
  return <LayoutStoreContext.Provider value={value}>{children}</LayoutStoreContext.Provider>;
}

export function useLayoutStore(): StoreValue {
  const ctx = useContext(LayoutStoreContext);
  if (!ctx) {
    throw new Error('useLayoutStore 必须在 <LayoutEditorProvider> 内使用');
  }
  return ctx;
}

/** 便捷 hook：当前选中 block */
export function useSelectedBlock() {
  const { state } = useLayoutStore();
  return state.doc.blocks.find((b) => b.id === state.selectedId) ?? null;
}

/** 便捷 hook：当前文档的校验预览（纯计算，不触发弹窗；导出守卫用） */
export function useValidationPreview() {
  const { state } = useLayoutStore();
  return useMemo(() => validateLayout(state.doc), [state.doc]);
}

/** 版本号便捷访问（组件展示/调试用） */
export const LAYOUT_DOC_VERSION = LAYOUT_VERSION;
