/**
 * EditorToolbar —— 编辑器顶部工具条。
 * 全部操作转发 store action 或回调，自身无业务状态。
 */

import { Button, Segmented, Space, Switch, Tooltip } from 'antd';
import {
  UndoOutlined, RedoOutlined, ReloadOutlined, SaveOutlined,
  DownloadOutlined, CloseOutlined, BorderOuterOutlined, ColumnHeightOutlined,
  PlusOutlined, QrcodeOutlined,
} from '@ant-design/icons';

import type { ZoomLevel } from '../../hooks/layout-editor/layoutReducer';
import { TEMPLATE_OPTIONS } from '../../lib/layout/templates';

export interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  zoom: ZoomLevel;
  gridSnap: boolean;
  alignAssist: boolean;
  saving: boolean;
  exporting: boolean;
  blockCount: number;
  /** 总页数（≥1） */
  pageCount: number;
  /** 当前模板 id（templates.ts 注册表） */
  templateId: string;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onZoom: (z: ZoomLevel) => void;
  onToggleGrid: () => void;
  onToggleAlign: () => void;
  onSave: () => void;
  onExport: () => void;
  onClose: () => void;
  /** 末尾追加一页（多页简历） */
  onAddPage?: () => void;
  /** 切换模板（调用方负责确认弹窗与 dispatch） */
  onApplyTemplate?: (templateId: string) => void;
  /** 插入二维码块（调用方弹二维码生成/上传窗）；已有块时改为定位到该块 */
  onInsertQrCode?: () => void;
  /** 画布已有二维码块 → 按钮语义变成「定位」（不重复插入） */
  hasQrCode?: boolean;
}

const ZOOM_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
];

export function EditorToolbar(props: EditorToolbarProps) {
  const {
    canUndo, canRedo, dirty, zoom, gridSnap, alignAssist,
    saving, exporting, blockCount, pageCount, templateId,
    onUndo, onRedo, onReset, onZoom, onToggleGrid, onToggleAlign,
    onSave, onExport, onClose, onAddPage, onApplyTemplate, onInsertQrCode, hasQrCode,
  } = props;

  const currentTemplate = TEMPLATE_OPTIONS.find((t) => t.value === templateId);

  return (
    <div className="le-toolbar">
      <Space wrap size={[8, 8]}>
        <Tooltip title="撤销（Ctrl+Z）">
          <Button size="small" icon={<UndoOutlined />} disabled={!canUndo} onClick={onUndo} />
        </Tooltip>
        <Tooltip title="重做（Ctrl+Shift+Z）">
          <Button size="small" icon={<RedoOutlined />} disabled={!canRedo} onClick={onRedo} />
        </Tooltip>
        <Tooltip title="恢复默认布局（当前改动可撤销回退）">
          <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
            重置布局
          </Button>
        </Tooltip>

        <Segmented
          size="small"
          value={zoom}
          options={ZOOM_OPTIONS}
          onChange={(v) => onZoom(v as ZoomLevel)}
        />

        <Tooltip title="网格吸附：移动时量化到 5mm 网格">
          <Space size={4}>
            <Switch size="small" checked={gridSnap} onChange={onToggleGrid} />
            <BorderOuterOutlined style={{ color: gridSnap ? 'var(--primary-600)' : undefined }} />
          </Space>
        </Tooltip>
        <Tooltip title="对齐辅助：边界/其他块边缘与中心自动吸附（阈值 6px）">
          <Space size={4}>
            <Switch size="small" checked={alignAssist} onChange={onToggleAlign} />
            <ColumnHeightOutlined style={{ color: alignAssist ? 'var(--primary-600)' : undefined }} />
          </Space>
        </Tooltip>

        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {blockCount} 个区块 · {pageCount} 页
        </span>
        {onApplyTemplate && (
          <Tooltip title={`模板：${currentTemplate?.desc ?? ''}（切换将按新模板重排，可 Ctrl+Z 撤销）`}>
            <Segmented
              size="small"
              value={templateId}
              options={TEMPLATE_OPTIONS.map((t) => ({ label: t.label, value: t.value }))}
              onChange={(v) => onApplyTemplate(v as string)}
            />
          </Tooltip>
        )}
        {onAddPage && (
          <Tooltip title="在末尾追加一页（随后可用「移到下页」把块搬过去）">
            <Button size="small" icon={<PlusOutlined />} onClick={onAddPage}>
              添加页
            </Button>
          </Tooltip>
        )}
        {onInsertQrCode && (
          <Tooltip
            title={
              hasQrCode
                ? '画布已有二维码块：点击定位到它（可在右侧面板更换/移除）'
                : '生成或上传二维码，插入到当前页内容底部'
            }
          >
            <Button size="small" icon={<QrcodeOutlined />} onClick={onInsertQrCode}>
              {hasQrCode ? '定位二维码' : '二维码'}
            </Button>
          </Tooltip>
        )}
      </Space>

      <Space wrap size={[8, 8]}>
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!dirty}
          onClick={onSave}
        >
          保存布局
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={onExport}
        >
          导出 PDF
        </Button>
        <Button size="small" icon={<CloseOutlined />} onClick={onClose}>
          退出编辑
        </Button>
      </Space>
    </div>
  );
}
