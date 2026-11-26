'use client';

import { Button, Progress } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, MinusCircleFilled } from '@ant-design/icons';

import type { ResumeUploadPhase } from '@/hooks/useResumeUpload';

/** 阶段指示条的四段标签（与 hook 的进度轴锚点一一对应） */
const STAGES: Array<{ key: string; label: string }> = [
  { key: 'prepare', label: '准备' },
  { key: 'upload', label: '上传' },
  { key: 'parse', label: '解析' },
  { key: 'finish', label: '完成' },
];

/** phase → 当前所处阶段索引（-1 表示流程已终结，阶段条不高亮任何段） */
function stageIndex(phase: ResumeUploadPhase): number {
  if (phase === 'preparing') return 0;
  if (phase === 'uploading') return 1;
  if (phase === 'parsing') return 2;
  if (phase === 'done') return 3;
  return -1;
}

/**
 * 简历上传进度条（渐进式：准备 → 上传 → 解析 → 完成）+ 取消上传。
 *
 * 进度语义（数值全程只增不减，100% 只在真正完成时出现）：
 *   准备：3% 起步（阶段内短暂驻留）
 *   上传：真实字节进度映射 5%~32%；环境不回报进度时平滑自走，不会停在 0 突跳
 *   解析：35% 起步，按本机历史耗时做指数渐近爬升，每 500ms 至少 +0.5%，
 *        条体持续可见前进，永不「爬到某数后一动不动」
 *   完成：100% 绿条；失败：红条 + 原因；取消：灰条 + 「已取消上传」
 *
 * 供首页上传 Dragger 与「我的简历」页顶部信息条共用；
 * data-testid 沿用 resume-upload-progress，取消按钮 resume-upload-cancel。
 */
export interface ResumeUploadProgressProps {
  phase: ResumeUploadPhase;
  percent: number;
  elapsed: number;
  fileName: string;
  /** 失败原因（phase=error 时展示） */
  errorMsg?: string;
  /** 解析耗时估算（秒），用于「预计约 X 秒」提示 */
  estimateSec?: number;
  /** 上传进行中（preparing/uploading/parsing）时展示「取消上传」按钮的回调 */
  onCancel?: () => void;
  /** done/error/cancelled 态的关闭/重传回调；不传则不显示关闭按钮 */
  onReset?: () => void;
  /** 关闭按钮文案（默认「关闭」；首页场景可用「重新上传」等） */
  resetText?: string;
  testId?: string;
}

export default function ResumeUploadProgress({
  phase,
  percent,
  elapsed,
  fileName,
  errorMsg,
  estimateSec,
  onCancel,
  onReset,
  resetText,
  testId = 'resume-upload-progress',
}: ResumeUploadProgressProps) {
  const name = fileName || '简历';
  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'parsing';
  const idx = stageIndex(phase);

  // 各阶段主文案
  let title = '';
  if (phase === 'preparing') title = `正在准备上传 ${name}…`;
  else if (phase === 'uploading') title = `正在上传 ${name}…`;
  else if (phase === 'parsing') title = `AI 正在解析简历 · 已等待 ${elapsed} 秒`;
  else if (phase === 'done') title = `解析完成，${name} 已就绪`;
  else if (phase === 'cancelled') title = '已取消上传';
  else if (phase === 'error') title = '上传失败';

  // 进度条：进行中一律显示真实推进的数值（解析段也是连续爬升，不再硬编码封顶值）
  const bar =
    phase === 'done' ? (
      <Progress percent={100} status="success" size="small" />
    ) : phase === 'error' ? (
      <Progress percent={percent > 0 ? percent : 100} status="exception" size="small" />
    ) : phase === 'cancelled' ? (
      <Progress percent={percent > 0 ? percent : 1} status="normal" size="small" />
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
          ) : phase === 'cancelled' ? (
            <MinusCircleFilled style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <LoadingOutlined spin style={{ color: 'var(--primary-500)' }} />
          )}
        </span>
        <span className="resume-upload-progress-title">{title}</span>
        {busy && onCancel ? (
          <Button
            size="small"
            type="text"
            danger
            className="resume-upload-progress-close"
            data-testid="resume-upload-cancel"
            onClick={onCancel}
          >
            取消上传
          </Button>
        ) : null}
        {!busy && onReset && (phase === 'done' || phase === 'error' || phase === 'cancelled') ? (
          <Button size="small" type="text" className="resume-upload-progress-close" onClick={onReset}>
            {resetText || (phase === 'cancelled' ? '重新上传' : '关闭')}
          </Button>
        ) : null}
      </div>
      {bar}
      {idx >= 0 && (
        <div className="resume-upload-progress-stages" data-testid="resume-upload-stages">
          {STAGES.map((s, i) => (
            <span key={s.key} className={`resume-upload-progress-stage${i <= idx ? ' is-active' : ''}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}
      {phase === 'parsing' && (
        <div className="resume-upload-progress-hint">
          正在识别文字并结构化，预计约 {estimateSec && estimateSec > 0 ? estimateSec : 30} 秒完成；
          扫描件 / 图片可能更久，请勿关闭页面
        </div>
      )}
      {phase === 'error' && errorMsg ? (
        <div className="resume-upload-progress-error">{errorMsg}</div>
      ) : null}
    </div>
  );
}
