'use client';

import { Button, Progress } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';

import type { ResumeUploadPhase } from '@/hooks/useResumeUpload';

/**
 * 简历上传四态进度条（上传中 / 解析中 / 成功 / 失败）。
 *
 * - 上传中：真实百分比实时更新（axios onUploadProgress）
 * - 解析中：进度条进入动画态但不显示数字（项目约定：解析阶段不伪装百分比，
 *   诚实显示已等待时长；条体 shimmer 动画表意「仍在工作」）
 * - 成功：绿色 100% + 「解析完成」
 * - 失败：红色条 + 失败原因
 *
 * 供首页上传 Dragger 与「我的简历」页顶部信息条共用；
 * data-testid 沿用 resume-upload-progress。
 */
export interface ResumeUploadProgressProps {
  phase: ResumeUploadPhase;
  percent: number;
  elapsed: number;
  fileName: string;
  /** 失败原因（phase=error 时展示） */
  errorMsg?: string;
  /** done/error 态的关闭回调；不传则不显示关闭按钮 */
  onReset?: () => void;
  /** 关闭按钮文案（默认「关闭」；首页场景可用「知道了」等） */
  resetText?: string;
  testId?: string;
}

export default function ResumeUploadProgress({
  phase,
  percent,
  elapsed,
  fileName,
  errorMsg,
  onReset,
  resetText,
  testId = 'resume-upload-progress',
}: ResumeUploadProgressProps) {
  const name = fileName || '简历';

  // 各阶段主文案（上传/解析沿用原 uploadPhaseText 口径）
  let title = '';
  if (phase === 'uploading') title = `正在上传 ${name}… ${percent}%`;
  else if (phase === 'parsing') title = `AI 正在解析简历 · 已等待 ${elapsed} 秒`;
  else if (phase === 'done') title = `解析完成，${name} 已就绪`;
  else if (phase === 'error') title = '上传失败';

  // 进度条各阶段形态：解析中不显示数字、条体保留动画；成功绿色；失败红色
  const bar =
    phase === 'done' ? (
      <Progress percent={100} status="success" size="small" />
    ) : phase === 'error' ? (
      <Progress percent={percent > 0 ? percent : 100} status="exception" size="small" />
    ) : phase === 'parsing' ? (
      <Progress percent={99} status="active" size="small" showInfo={false} />
    ) : (
      <Progress percent={percent} status="active" size="small" />
    );

  return (
    <div
      className={`resume-upload-progress is-${phase}`}
      data-testid={testId}
      role="status"
    >
      <div className="resume-upload-progress-head">
        <span className="resume-upload-progress-icon">
          {phase === 'done' ? (
            <CheckCircleFilled style={{ color: 'var(--success-600)' }} />
          ) : phase === 'error' ? (
            <CloseCircleFilled style={{ color: 'var(--error-500)' }} />
          ) : (
            <LoadingOutlined spin style={{ color: 'var(--primary-500)' }} />
          )}
        </span>
        <span className="resume-upload-progress-title">{title}</span>
        {onReset && (phase === 'done' || phase === 'error') ? (
          <Button size="small" type="text" className="resume-upload-progress-close" onClick={onReset}>
            {resetText || '关闭'}
          </Button>
        ) : null}
      </div>
      {bar}
      {phase === 'parsing' && (
        <div className="resume-upload-progress-hint">
          正在识别文字并结构化，扫描件 / 图片首次解析可能需 1–2 分钟，请勿关闭页面
        </div>
      )}
      {phase === 'error' && errorMsg ? (
        <div className="resume-upload-progress-error">{errorMsg}</div>
      ) : null}
    </div>
  );
}
