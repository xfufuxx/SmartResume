/**
 * 导出守卫 —— 编排「校验 → 自动修正 → 弹窗确认 → 执行导出」。
 *
 * 流程：
 * 1. requestExport()：跑 validateLayout（默认自动修正）；
 * 2. 有自动修正 → dispatch APPLY_AUTOFIX 写回 store（入撤销栈，用户可回退）；
 * 3. 有 warn 级问题（重叠等）→ 打开弹窗等用户确认；
 * 4. 无 warn → 直接 onExport。
 *
 * 弹窗由调用方渲染 <ValidationDialog result={pending} ... />。
 */

import { useCallback, useState } from 'react';

import type { LayoutDocument } from '../../lib/layout/types.ts';
import type { ValidationResult } from '../../lib/layout/validate.ts';
import { validateLayout } from '../../lib/layout/validate.ts';
import { useLayoutStore } from './useLayoutStore.tsx';

export interface UseExportGuardOptions {
  /** 校验通过/用户确认后执行真正的导出（如 reexport API 调用） */
  onExport: (doc: LayoutDocument) => void | Promise<void>;
}

export interface ExportGuardApi {
  /** 点击「导出 PDF」按钮时调用 */
  requestExport: () => void;
  /** 待确认的校验结果；非 null 时应打开 ValidationDialog */
  pending: ValidationResult | null;
  /** 弹窗「仍然导出」 */
  confirmExport: () => Promise<void>;
  /** 弹窗「取消」 */
  cancelExport: () => void;
}

export function useExportGuard({ onExport }: UseExportGuardOptions): ExportGuardApi {
  const { state, dispatch } = useLayoutStore();
  const [pending, setPending] = useState<ValidationResult | null>(null);

  const requestExport = useCallback(() => {
    const result = validateLayout(state.doc);
    // 自动修正写回 store（APPLY_AUTOFIX 内部幂等，无变化不入栈）
    if (result.autoFixedCount > 0) {
      dispatch({ type: 'APPLY_AUTOFIX' });
    }
    if (result.needsAttention) {
      setPending(result);
      return;
    }
    void onExport(result.doc);
  }, [state.doc, dispatch, onExport]);

  const confirmExport = useCallback(async () => {
    if (!pending) return;
    const doc = pending.doc;
    setPending(null);
    await onExport(doc);
  }, [pending, onExport]);

  const cancelExport = useCallback(() => setPending(null), []);

  return { requestExport, pending, confirmExport, cancelExport };
}
