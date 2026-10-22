/**
 * LayoutEditor —— 可视化排版编辑器根组件。
 *
 * 组装：Provider（store）→ 工具栏 + A4 画布 + 属性面板 + 导出校验弹窗。
 * 数据流：
 * - 读：parseLayout(record.layout_json) ?? buildLayout(optimized_json)（由调用方传入 initialDoc）；
 * - 写：保存布局 → PUT /{opt_id}/layout；导出 → POST /{opt_id}/export-layout
 *   （前端生成 body HTML + CSS，后端包字体壳后用 Playwright 出 A4 PDF）。
 *
 * 1:1 保证：预览与导出共用 renderHtml.ts 的 blockInnerHtml / BLOCK_CSS，
 * 唯一的物理真相是 mm（CSS mm 预览 ↔ Playwright A4 pt，同一张纸）。
 */

import { useCallback, useEffect, useState } from 'react';
import { message, Modal } from 'antd';

import type { Block, LayoutDocument } from '../../lib/layout/types';
import { BLOCK_CSS, LAYOUT_STYLE_ELEMENT_ID, layoutBodyHtml } from '../../lib/layout/renderHtml';
import {
  rebuildContent, hasContentChanges, cleanResumeContent,
} from '../../lib/layout/rebuildContent';
import { pageCountOf } from '../../lib/layout/paging';
import { DEFAULT_TEMPLATE_ID, getTemplate } from '../../lib/layout/templates';
import { editor, API_BASE_URL } from '../../lib/api';
import type { ZoomLevel } from '../../hooks/layout-editor/layoutReducer';
import {
  LayoutEditorProvider, useLayoutStore, useSelectedBlock,
} from '../../hooks/layout-editor/useLayoutStore';
import { useMediaQuery } from '../../hooks/layout-editor/useMediaQuery';
import { useExportGuard } from '../../hooks/layout-editor/useExportGuard';
import { EditorToolbar } from './EditorToolbar';
import { A4Canvas } from './A4Canvas';
import { InspectorPanel } from './InspectorPanel';
import { SortablePanel } from './SortablePanel';
import { ValidationDialog } from './ValidationDialog';
import './editor.css';

export interface LayoutEditorProps {
  /** 优化记录 id */
  optId: string;
  /** 初始布局文档（调用方负责 parseLayout ?? buildLayout） */
  initialDoc: LayoutDocument;
  /**
   * 简历内容基线（详情页的 optimized_json）。
   * 行内编辑保存时按 doc 的 payload 重组回写；不传则只存布局。
   */
  initialContent?: Record<string, unknown> | null;
  /** 退出编辑器 */
  onClose: () => void;
  /** 导出成功（回传 pdf_url，供详情页更新下载按钮） */
  onExported?: (pdfUrl: string) => void;
  /** 保存成功（供详情页刷新 layout_json 缓存） */
  onSaved?: () => void;
}

/** 注入共享块样式 + 中文字体（预览与 PDF 用同一份 Noto Sans SC） */
function useEditorAssets() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById(LAYOUT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = LAYOUT_STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = BLOCK_CSS;

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = `${API_BASE_URL}/api/optimize/layout/fonts.css`;
    document.head.appendChild(fontLink);

    return () => {
      fontLink.remove();
      // 样式表保留给可能并存的下一个实例；字体文件已被浏览器缓存（immutable）
    };
  }, []);
}

/** Ctrl+Z / Ctrl+Shift+Z 快捷键（焦点在输入框时不劫持） */
function useUndoShortcuts(onUndo: () => void, onRedo: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onRedo]);
}

function LayoutEditorInner({
  optId, onClose, onExported, onSaved, initialContent,
}: Omit<LayoutEditorProps, 'initialDoc'>) {
  const { state, dispatch } = useLayoutStore();
  const selected = useSelectedBlock();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // 窄屏（≤1023px，与 editor.css 的布局堆叠断点一致）：画布下方出排序面板，
  // 拖拽重排走这里；画布自身在 ≤767px 时只读（useIsMobile）。
  const compact = useMediaQuery('(max-width: 1023px)');

  useEditorAssets();
  useUndoShortcuts(
    useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]),
    useCallback(() => dispatch({ type: 'REDO' }), [dispatch]),
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // 行内编辑改的是布局快照 payload：先回写内容（详情页/对比区才不会
      // 停留在旧文本），再存布局。personal_info 受后端保护，rebuildContent
      // 本就不回写它——那部分改动只影响导出（layout payload 是导出真相）。
      const contentChanged =
        !!initialContent && hasContentChanges(state.doc, state.initialDoc);
      if (contentChanged && initialContent) {
        await editor.updateContent(
          optId,
          cleanResumeContent(rebuildContent(state.doc, initialContent)),
        );
      }
      await editor.saveLayout(optId, state.doc as unknown as Record<string, unknown>);
      dispatch({ type: 'MARK_SAVED' });
      message.success(contentChanged ? '内容与布局已保存' : '布局已保存，下次打开自动恢复');
      onSaved?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [optId, state.doc, state.initialDoc, initialContent, dispatch, onSaved]);

  /** 真正的导出：等字体就绪 → 前端生成 body HTML + CSS → 后端包壳出 PDF */
  const runExport = useCallback(
    async (doc: LayoutDocument) => {
      setExporting(true);
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch {
            // 字体状态 API 不可用时不阻塞导出
          }
        }
        const res = await editor.exportLayout(
          optId,
          layoutBodyHtml(doc),
          BLOCK_CSS,
          doc as unknown as Record<string, unknown>,
        );
        const pdfUrl: string | undefined = res.data?.pdf_url;
        if (pdfUrl) onExported?.(pdfUrl);
        message.success('PDF 已按当前布局生成');
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '导出失败');
      } finally {
        setExporting(false);
      }
    },
    [optId, onExported],
  );

  const guard = useExportGuard({ onExport: runExport });

  /** 模板切换：弹确认（重排会重置手调位置/分页），确认后入历史栈可撤销 */
  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (templateId === (state.doc.template ?? DEFAULT_TEMPLATE_ID)) return;
      const tpl = getTemplate(templateId);
      if (!tpl) return;
      Modal.confirm({
        title: `切换到「${tpl.name}」模板？`,
        content: '将按新模板重新排版：区块顺序与内容保留，手动调整的位置和分页会重置（可用 Ctrl+Z 撤销）。',
        okText: '切换',
        cancelText: '取消',
        onOk: () => dispatch({ type: 'APPLY_TEMPLATE', templateId }),
      });
    },
    [state.doc.template, dispatch],
  );

  return (
    <div className="le-layout">
      <EditorToolbar
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        dirty={state.dirty}
        zoom={state.zoom}
        gridSnap={state.gridSnap}
        alignAssist={state.alignAssist}
        saving={saving}
        exporting={exporting}
        blockCount={state.doc.blocks.length}
        pageCount={pageCountOf(state.doc)}
        templateId={state.doc.template ?? DEFAULT_TEMPLATE_ID}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onReset={() => dispatch({ type: 'RESET_LAYOUT' })}
        onZoom={(z) => dispatch({ type: 'SET_ZOOM', zoom: z })}
        onToggleGrid={() => dispatch({ type: 'TOGGLE_GRID' })}
        onToggleAlign={() => dispatch({ type: 'TOGGLE_ALIGN' })}
        onSave={handleSave}
        onExport={guard.requestExport}
        onClose={onClose}
        onAddPage={() => dispatch({ type: 'ADD_PAGE' })}
        onApplyTemplate={handleApplyTemplate}
      />

      <div className="le-body">
        <A4Canvas
          doc={state.doc}
          zoom={state.zoom}
          gridSnap={state.gridSnap}
          alignAssist={state.alignAssist}
          selectedId={state.selectedId}
          activePage={state.activePage}
          editingId={state.editingId}
          onSelect={(id) => dispatch({ type: 'SELECT_BLOCK', id })}
          onCommitRect={(id, rect) => dispatch({ type: 'MOVE_BLOCK', id, rect })}
          onStartEdit={(id) => dispatch({ type: 'START_EDIT', id })}
          onContentChange={(id, payload) => dispatch({ type: 'UPDATE_CONTENT', id, payload })}
          onEndEdit={() => dispatch({ type: 'END_EDIT' })}
          onPageChange={(p) => dispatch({ type: 'SET_PAGE', page: p })}
          onAddPage={() => dispatch({ type: 'ADD_PAGE' })}
          onRemovePage={(p) => dispatch({ type: 'REMOVE_PAGE', page: p })}
        />
        {compact && (
          <SortablePanel
            doc={state.doc}
            selectedId={state.selectedId}
            onReorder={(activeId, overId) =>
              dispatch({ type: 'REORDER_BLOCK', activeId, overId })
            }
            onSelect={(id) => dispatch({ type: 'SELECT_BLOCK', id })}
            onToggleVisible={(id) => dispatch({ type: 'TOGGLE_VISIBLE', id })}
          />
        )}
        <InspectorPanel
          state={state}
          selected={selected}
          onSetFreedom={(id, freedom) => dispatch({ type: 'SET_FREEDOM', id, freedom })}
          onToggleLock={(id) => dispatch({ type: 'TOGGLE_LOCK', id })}
          onToggleVisible={(id) => dispatch({ type: 'TOGGLE_VISIBLE', id })}
          onBringFront={(id) => dispatch({ type: 'BRING_FRONT', id })}
          onSendBack={(id) => dispatch({ type: 'SEND_BACK', id })}
          onStartEdit={(id) => dispatch({ type: 'START_EDIT', id })}
          onEndEdit={() => dispatch({ type: 'END_EDIT' })}
          onMoveToPage={(id, targetPage) => dispatch({ type: 'MOVE_BLOCK_TO_PAGE', id, targetPage })}
        />
      </div>

      <ValidationDialog
        open={guard.pending !== null}
        result={guard.pending}
        exporting={exporting}
        onConfirm={guard.confirmExport}
        onCancel={guard.cancelExport}
      />
    </div>
  );
}

export function LayoutEditor(props: LayoutEditorProps) {
  const { initialDoc, ...rest } = props;
  return (
    <LayoutEditorProvider initialDoc={initialDoc}>
      <LayoutEditorInner {...rest} />
    </LayoutEditorProvider>
  );
}
export default LayoutEditor;
