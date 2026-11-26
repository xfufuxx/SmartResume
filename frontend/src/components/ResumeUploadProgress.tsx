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
 * 简历上传进度条（阶段化：准备 → 上传 → 解析 → 完成）+ 取消上传。
 *
 * 进度观感：整条 0~100 进度轴分段推进，不再出现开局即接近终点的观感——
 *   上传中：真实字节进度映射到 5%~35%（显示数字）
 *   解析中：35%~88% 缓慢爬升（每秒 +2，88% 封顶驻留；显示数字 + 已等待时长）
 *   成功：绿色 100%；失败：红色条 + 失败原因；取消：灰色条 + 「已取消上传」
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
  else if (phase === 'uploading') title = `正在上传 ${name}… ${percent}%`;
  else if (phase === 'parsing') title = `AI 正在解析简历 · 已等待 ${elapsed} 秒`;
  else if (phase === 'done') title = `解析完成，${name} 已就绪`;
  else if (phase === 'cancelled') title = '已取消上传';
  else if (phase === 'error') title = '上传失败';

  // 进度条各阶段形态：解析中随爬升显示数字；成功绿色；失败红色；取消灰色驻留
  const bar =
    phase === 'done' ? (
      <Progress percent={100} status="success" size="small" />
    ) : phase === 'error' ? (
      <Progress percent={percent > 0 ? percent : 100} status="exception" size="small" />
    ) : phase === 'cancelled' ? (
      <Progress percent={percent > 0 ? percent : 1} status="normal" size="small" />
    ) : phase === 'preparing' ? (
      <Progress percent={percent > 0 ? percent : 2} status="active" size="small" />
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
          正在识别文字并结构化，扫描件 / 图片首次解析可能需 1–2 分钟，请勿关闭页面
        </div>
      )}
      {phase === 'error' && errorMsg ? (
        <div className="resume-upload-progress-error">{errorMsg}</div>
      ) : null}
    </div>
  );
}
