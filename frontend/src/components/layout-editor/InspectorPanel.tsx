/**
 * InspectorPanel —— 选中区块的属性面板（画布右侧）。
 * 无选中时展示布局统计与操作提示。
 */

import { Button, Descriptions, Empty, Segmented, Space, Switch, Tag } from 'antd';
import {
  VerticalAlignTopOutlined, VerticalAlignBottomOutlined, LockOutlined, EyeInvisibleOutlined,
  EditOutlined,
} from '@ant-design/icons';

import type { Block } from '../../lib/layout/types';
import type { DragFreedom } from '../../lib/layout/types';
import { pageCountOf, pageOf } from '../../lib/layout/paging';
import type { EditorState } from '../../hooks/layout-editor/layoutReducer';

const FREEDOM_OPTIONS = [
  { label: '自由', value: 'free' },
  { label: '仅水平', value: 'horizontal' },
  { label: '仅垂直', value: 'vertical' },
  { label: '锁定', value: 'locked' },
];

const TYPE_LABELS: Record<Block['type'], string> = {
  header: '姓名',
  contact: '联系方式',
  avatar: '头像',
  divider: '分隔线',
  summary: '个人总结',
  section: '章节标题',
  item: '内容条目',
  'skill-group': '技能组',
  text: '文本',
};

export interface InspectorPanelProps {
  state: EditorState;
  selected: Block | null;
  onSetFreedom: (id: string, freedom: DragFreedom) => void;
  onToggleLock: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onBringFront: (id: string) => void;
  onSendBack: (id: string) => void;
  /** 进入/退出行内编辑 */
  onStartEdit?: (id: string) => void;
  onEndEdit?: () => void;
  /** 把选中块移到另一页（多页简历） */
  onMoveToPage?: (id: string, targetPage: number) => void;
}

function fmt(v: number): string {
  return v.toFixed(2);
}

export function InspectorPanel({
  state, selected, onSetFreedom, onToggleLock, onToggleVisible, onBringFront, onSendBack,
  onStartEdit, onEndEdit, onMoveToPage,
}: InspectorPanelProps) {
  if (!selected) {
    return (
      <div className="le-inspector">
        <Empty
          description="点击画布中的区块开始编辑"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 48 }}
        />
        <Descriptions size="small" column={1} style={{ marginTop: 16 }}>
          <Descriptions.Item label="区块总数">{state.doc.blocks.length}</Descriptions.Item>
          <Descriptions.Item label="页数">{pageCountOf(state.doc)}</Descriptions.Item>
          <Descriptions.Item label="隐藏区块">
            {state.doc.blocks.filter((b) => b.visible === false).length}
          </Descriptions.Item>
          <Descriptions.Item label="锁定区块">
            {state.doc.blocks.filter((b) => b.locked).length}
          </Descriptions.Item>
          <Descriptions.Item label="未保存修改">{state.dirty ? '有' : '无'}</Descriptions.Item>
        </Descriptions>
      </div>
    );
  }

  const { rect, sizePolicy } = selected;
  const locked = selected.locked === true;
  const editing = state.editingId === selected.id;
  const canEdit = !locked && selected.type !== 'divider';
  const blockPage = pageOf(selected);
  const totalPages = pageCountOf(state.doc);

  return (
    <div className="le-inspector">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color="blue">{TYPE_LABELS[selected.type] ?? selected.type}</Tag>
          <Tag>{selected.id}</Tag>
          {totalPages > 1 && <Tag color="purple">第 {blockPage + 1} / {totalPages} 页</Tag>}
        </Space>

        {totalPages > 1 && onMoveToPage && (
          <div>
            <div className="le-inspector-label">所在页（跨页移动）</div>
            <Space wrap>
              <Button
                size="small"
                disabled={blockPage === 0}
                onClick={() => onMoveToPage(selected.id, blockPage - 1)}
              >
                上移一页
              </Button>
              <Button
                size="small"
                disabled={blockPage >= totalPages - 1}
                onClick={() => onMoveToPage(selected.id, blockPage + 1)}
              >
                下移一页
              </Button>
            </Space>
          </div>
        )}

        {canEdit && (
          <div>
            <div className="le-inspector-label">内容</div>
            {editing ? (
              <Button size="small" block onClick={() => onEndEdit?.()}>
                完成编辑（Esc）
              </Button>
            ) : (
              <Button
                size="small"
                block
                type="primary"
                ghost
                icon={<EditOutlined />}
                onClick={() => onStartEdit?.(selected.id)}
              >
                编辑内容（双击区块）
              </Button>
            )}
          </div>
        )}

        <Descriptions size="small" column={2} style={{ width: '100%' }}>
          <Descriptions.Item label="X">{fmt(rect.x)} mm</Descriptions.Item>
          <Descriptions.Item label="Y">{fmt(rect.y)} mm</Descriptions.Item>
          <Descriptions.Item label="宽">{fmt(rect.w)} mm</Descriptions.Item>
          <Descriptions.Item label="高">{fmt(rect.h)} mm</Descriptions.Item>
        </Descriptions>

        <div>
          <div className="le-inspector-label">拖动自由度</div>
          <Segmented
            block
            size="small"
            value={selected.freedom}
            options={FREEDOM_OPTIONS}
            onChange={(v) => onSetFreedom(selected.id, v as DragFreedom)}
          />
        </div>

        <div>
          <div className="le-inspector-label">尺寸限制</div>
          <Space wrap size={[4, 4]}>
            <Tag color={sizePolicy.resizableW ? 'green' : 'default'}>
              {sizePolicy.resizableW ? '宽度可调' : '宽度固定'}
            </Tag>
            <Tag color={sizePolicy.resizableH ? 'green' : 'default'}>
              {sizePolicy.resizableH ? '高度可调' : '高度固定'}
            </Tag>
            <Tag>
              最小 {sizePolicy.minW}×{sizePolicy.minH} mm
            </Tag>
          </Space>
        </div>

        <div>
          <div className="le-inspector-label">层级与状态</div>
          <Space wrap size={[4, 4]}>
            <Button size="small" icon={<VerticalAlignTopOutlined />} onClick={() => onBringFront(selected.id)}>
              置顶
            </Button>
            <Button size="small" icon={<VerticalAlignBottomOutlined />} onClick={() => onSendBack(selected.id)}>
              置底
            </Button>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Space size={16}>
              <Space size={4}>
                <Switch size="small" checked={locked} onChange={() => onToggleLock(selected.id)} />
                <LockOutlined style={{ color: locked ? 'var(--error-500)' : undefined }} />
                <span style={{ fontSize: 12 }}>锁定</span>
              </Space>
              <Space size={4}>
                <Switch
                  size="small"
                  checked={selected.visible !== false}
                  onChange={() => onToggleVisible(selected.id)}
                />
                <EyeInvisibleOutlined />
                <span style={{ fontSize: 12 }}>可见</span>
              </Space>
            </Space>
          </div>
        </div>

        <div className="le-inspector-tip">
          拖拽移动 · 方向键微调 1px（Shift 10px）· 选中后拖四角缩放
          <br />
          双击区块（或按 Enter）行内编辑内容 · Esc 完成
        </div>
      </Space>
    </div>
  );
}
