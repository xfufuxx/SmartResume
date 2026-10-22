/**
 * InlineEditor —— 块内行内编辑器（双击块进入）。
 *
 * 设计约束：
 * - 表单字段严格对应 renderHtml 真正渲染的字段（itemKindOf 三类分流），
 *   不暴露渲染器不读的字段——改了就一定看得见；
 * - 本地 draft 缓冲：每次变化既 setDraft 也回调 onChange（实时预览 + 红点
 *   实时反馈），reducer 侧会把一次编辑会话合并为一步历史；
 * - 所有指针/键盘事件 stopPropagation：编辑态的块不是拖拽目标，
 *   也不能让点击冒泡到画布空白处触发「取消选中 → 退出编辑」；
 * - 失焦（焦点离开容器）即提交退出；Esc 立即退出。
 */

import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button, Input, Tag } from 'antd';
import { CloseCircleFilled, PlusOutlined } from '@ant-design/icons';

import type { Block } from '../../lib/layout/types';
import { itemKindOf } from '../../lib/layout/renderHtml';

export interface InlineEditorProps {
  block: Block;
  /** draft 变化（实时提交到 store：预览与红点立即反映） */
  onChange: (payload: unknown) => void;
  /** 提交并退出编辑态 */
  onDone: () => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 紧凑无边框输入框：行内编辑就该长得像内容，不像表单 */
const inputCls = 'le-ie-input';

export function InlineEditor({ block, onChange, onDone }: InlineEditorProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...asRecord(block.contentRef.payload),
  }));
  const rootRef = useRef<HTMLDivElement>(null);

  /** 改字段：更新本地 draft 并实时上抛 */
  const patch = useCallback(
    (key: string, value: unknown) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  /** 焦点离开整个编辑器 → 提交退出。两类不算离开：
   *  1. 焦点移到编辑器内部（点「添加要点」等按钮）；
   *  2. 焦点被抢回宿主块（.lk-blk，tabIndex=0）——双击尾随的 click 事件
   *     会把焦点默认移回可聚焦的块 div，若不排除会「一进编辑就退出」。
   *     真正的离开（点别处/点空白）relatedTarget 是别的块或 body。 */
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    if (next && rootRef.current?.parentElement?.contains(next)) return;
    onDone();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDone();
    }
  };

  /** 吞掉指针/双击事件：不触发拖拽、不冒泡到画布空白处取消选中 */
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const kind = block.type === 'item' ? itemKindOf(block.contentRef.source) : 'unknown';

  return (
    <div
      ref={rootRef}
      className="le-inline-editor"
      onPointerDown={stop}
      onDoubleClick={stop}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {block.type === 'header' && (
        <Input
          className={inputCls}
          size="small"
          variant="borderless"
          autoFocus
          value={str(draft.name)}
          placeholder="姓名"
          onChange={(e) => patch('name', e.target.value)}
        />
      )}

      {block.type === 'contact' && (
        <div className="le-ie-grid2">
          {(['email', 'phone', 'address', 'linkedin', 'github'] as const).map((k) => (
            <Input
              key={k}
              className={inputCls}
              size="small"
              variant="borderless"
              autoFocus={k === 'email'}
              value={str(draft[k])}
              placeholder={k}
              onChange={(e) => patch(k, e.target.value)}
            />
          ))}
        </div>
      )}

      {block.type === 'summary' && (
        <Input.TextArea
          className={inputCls}
          size="small"
          variant="borderless"
          autoFocus
          autoSize={{ minRows: 2, maxRows: 10 }}
          value={str(draft.summary)}
          placeholder="个人总结"
          onChange={(e) => patch('summary', e.target.value)}
        />
      )}

      {block.type === 'text' && (
        <Input.TextArea
          className={inputCls}
          size="small"
          variant="borderless"
          autoFocus
          autoSize={{ minRows: 2, maxRows: 10 }}
          value={str(draft.text)}
          placeholder="文本内容"
          onChange={(e) => patch('text', e.target.value)}
        />
      )}

      {block.type === 'section' && (
        <Input
          className={inputCls}
          size="small"
          variant="borderless"
          autoFocus
          value={str(draft.title)}
          placeholder="章节标题"
          onChange={(e) => patch('title', e.target.value)}
        />
      )}

      {block.type === 'skill-group' && (
        <div className="le-ie-tags">
          {arr(draft.skills).map((s, i) => (
            <Tag
              key={`${i}-${str(s)}`}
              closable
              onClose={(e) => {
                e.preventDefault();
                const next = arr(draft.skills).filter((_, j) => j !== i);
                patch('skills', next);
              }}
            >
              {str(s)}
            </Tag>
          ))}
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            autoFocus
            placeholder="输入技能后回车添加"
            onPressEnter={(e) => {
              const v = e.currentTarget.value.trim();
              if (!v) return;
              e.currentTarget.value = '';
              patch('skills', [...arr(draft.skills), v]);
            }}
          />
        </div>
      )}

      {block.type === 'avatar' && (
        <Input
          className={inputCls}
          size="small"
          variant="borderless"
          autoFocus
          value={str(draft.url) || str(draft.avatar_url) || str(draft.avatar)}
          placeholder="头像图片 URL"
          onChange={(e) => patch('url', e.target.value)}
        />
      )}

      {block.type === 'item' && kind === 'experience' && (
        <div className="le-ie-grid2">
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            autoFocus
            value={str(draft.title)}
            placeholder="职位"
            onChange={(e) => patch('title', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.company)}
            placeholder="公司"
            onChange={(e) => patch('company', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.start)}
            placeholder="开始时间"
            onChange={(e) => patch('start', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.end)}
            placeholder="结束时间"
            onChange={(e) => patch('end', e.target.value)}
          />
        </div>
      )}

      {block.type === 'item' && kind === 'education' && (
        <div className="le-ie-grid2">
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            autoFocus
            value={str(draft.school)}
            placeholder="学校"
            onChange={(e) => patch('school', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.degree)}
            placeholder="学位"
            onChange={(e) => patch('degree', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.major)}
            placeholder="专业"
            onChange={(e) => patch('major', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.start)}
            placeholder="开始时间"
            onChange={(e) => patch('start', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.end)}
            placeholder="结束时间"
            onChange={(e) => patch('end', e.target.value)}
          />
        </div>
      )}

      {block.type === 'item' && kind === 'projects' && (
        <>
          <div className="le-ie-grid2">
            <Input
              className={inputCls}
              size="small"
              variant="borderless"
              autoFocus
              value={str(draft.name)}
              placeholder="项目名"
              onChange={(e) => patch('name', e.target.value)}
            />
            <Input
              className={inputCls}
              size="small"
              variant="borderless"
              value={str(draft.role)}
              placeholder="角色"
              onChange={(e) => patch('role', e.target.value)}
            />
            <Input
              className={inputCls}
              size="small"
              variant="borderless"
              value={str(draft.start)}
              placeholder="开始时间"
              onChange={(e) => patch('start', e.target.value)}
            />
            <Input
              className={inputCls}
              size="small"
              variant="borderless"
              value={str(draft.end)}
              placeholder="结束时间"
              onChange={(e) => patch('end', e.target.value)}
            />
          </div>
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={str(draft.description)}
            placeholder="项目描述（可选）"
            onChange={(e) => patch('description', e.target.value)}
          />
          <Input
            className={inputCls}
            size="small"
            variant="borderless"
            value={arr(draft.tech).map((t) => str(t)).join('、')}
            placeholder="技术栈（顿号分隔）"
            onChange={(e) =>
              patch(
                'tech',
                e.target.value
                  .split('、')
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
        </>
      )}

      {block.type === 'item' && (
        <div className="le-ie-points">
          {arr(draft.points).map((p, i) => (
            <div className="le-ie-point-row" key={i}>
              <Input
                className={inputCls}
                size="small"
                variant="borderless"
                value={str(p)}
                placeholder={`要点 ${i + 1}`}
                onChange={(e) => {
                  const next = [...arr(draft.points)];
                  next[i] = e.target.value;
                  patch('points', next);
                }}
              />
              <Button
                type="text"
                size="small"
                className="le-ie-point-del"
                icon={<CloseCircleFilled />}
                onClick={() => {
                  const next = arr(draft.points).filter((_, j) => j !== i);
                  patch('points', next);
                }}
              />
            </div>
          ))}
          <Button
            type="link"
            size="small"
            className="le-ie-point-add"
            icon={<PlusOutlined />}
            onClick={() => patch('points', [...arr(draft.points), ''])}
          >
            添加要点
          </Button>
        </div>
      )}
    </div>
  );
}

export default InlineEditor;
