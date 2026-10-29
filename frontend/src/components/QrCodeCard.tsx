'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Divider, Input, Space, Tag, Typography, Upload, message } from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  LinkOutlined,
  QrcodeOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';

import {
  collectResumeLinks,
  generateQrPngDataUrl,
  generateQrSvg,
  isValidQrUrl,
  normalizeUrl,
  qrFileName,
  svgToPngBlob,
  triggerDownload,
} from '@/lib/qrcode';

const { Text } = Typography;

export interface QrLink {
  label: string;
  url: string;
}

/** 写入简历底部的二维码数据（image 为 data URL，后端 ≤300KB 校验） */
export interface ResumeQr {
  image: string;
  url: string;
  label: string;
}

interface QrCodeCardProps {
  /** 预填 URL（如简历分享链接、个人主页） */
  initialUrl?: string;
  /** 预填标签 */
  initialLabel?: string;
  /** 受控 URL（传入后由外部驱动，用于跨组件联动如「最近生成」） */
  url?: string;
  /** 受控 URL 变更回调 */
  onUrlChange?: (url: string) => void;
  /** 受控标签 */
  label?: string;
  /** 受控标签变更回调 */
  onLabelChange?: (label: string) => void;
  /** 候选链接快填（通常来自简历 JSON 自动提取） */
  suggestions?: QrLink[];
  /** 用户完成一次生成（点击下载）时回调，用于记录历史 */
  onGenerated?: (url: string, label: string) => void;
  /** 紧凑模式（嵌入弹窗/抽屉时隐藏说明文案） */
  compact?: boolean;
  /** 提供「添加到简历底部」能力（传入后显示该入口；null 入参 = 移除） */
  onAddToResume?: (qr: ResumeQr | null) => Promise<void> | void;
  /** 添加请求进行中（按钮 loading） */
  adding?: boolean;
  /** 记录当前已存在的底部二维码（用于展示「已添加」状态与移除入口） */
  existingQr?: { label?: string; url?: string } | null;
}

/**
 * 二维码组件：生成、展示与下载（参考 jadeAI 二维码模块的交互）。
 *
 * - 生成：输入 URL 即时渲染 SVG 预览（防抖 400ms），非法 URL 不渲染
 * - 展示：SVG 内联 + 标签；候选链接一键快填
 * - 下载：PNG（canvas 光栅化）/ SVG（原始矢量）两种格式
 */
export default function QrCodeCard({
  initialUrl = '',
  initialLabel = '',
  url: controlledUrl,
  onUrlChange,
  label: controlledLabel,
  onLabelChange,
  suggestions,
  onGenerated,
  compact = false,
  onAddToResume,
  adding = false,
  existingQr = null,
}: QrCodeCardProps) {
  const [innerUrl, setInnerUrl] = useState(initialUrl);
  const [innerLabel, setInnerLabel] = useState(initialLabel);
  const [svg, setSvg] = useState('');
  const [pngDataUrl, setPngDataUrl] = useState('');
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [regenNonce, setRegenNonce] = useState(0);
  /** 用户上传的已有二维码（data URL）；非空时「添加到简历」优先用它 */
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 受控 / 非受控双模态：传入 url/label 时完全由外部驱动
  const isControlled = controlledUrl !== undefined;
  const url = isControlled ? controlledUrl : innerUrl;
  const setUrl = useCallback(
    (next: string) => {
      if (!isControlled) setInnerUrl(next);
      onUrlChange?.(next);
    },
    [isControlled, onUrlChange],
  );
  const label = controlledLabel !== undefined ? controlledLabel : innerLabel;
  const setLabel = useCallback(
    (next: string) => {
      if (controlledLabel === undefined) setInnerLabel(next);
      onLabelChange?.(next);
    },
    [controlledLabel, onLabelChange],
  );

  const urlValid = useMemo(() => isValidQrUrl(url), [url]);
  const canRender = urlValid && !!url.trim();

  // URL 变化（或手动重新生成）→ 防抖重渲染（输入过程中不打断用户）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!canRender) {
      setSvg('');
      setPngDataUrl('');
      setError(url.trim() && !urlValid ? 'URL 不合法，需形如 example.com 的网址' : '');
      return;
    }
    setRendering(true);
    debounceRef.current = setTimeout(() => {
      (async () => {
        try {
          const [svgText, png] = await Promise.all([
            generateQrSvg(url),
            generateQrPngDataUrl(url),
          ]);
          setSvg(svgText);
          setPngDataUrl(png);
          setError('');
        } catch (e) {
          setSvg('');
          setPngDataUrl('');
          setError(e instanceof Error ? e.message : '二维码生成失败');
        } finally {
          setRendering(false);
        }
      })();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url, canRender, urlValid, regenNonce]);

  const handleDownloadPng = useCallback(async () => {
    if (!svg) return;
    try {
      // 优先用已渲染的 PNG dataURL；失败则用 SVG 现时光栅化
      if (pngDataUrl) {
        triggerDownload(pngDataUrl, qrFileName(url, 'png'));
      } else {
        const blob = await svgToPngBlob(svg);
        triggerDownload(blob, qrFileName(url, 'png'));
      }
      onGenerated?.(url, label);
      message.success('PNG 已开始下载');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'PNG 下载失败');
    }
  }, [svg, pngDataUrl, url, label, onGenerated]);

  const handleDownloadSvg = useCallback(() => {
    if (!svg) return;
    try {
      triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), qrFileName(url, 'svg'));
      onGenerated?.(url, label);
      message.success('SVG 已开始下载');
    } catch (e) {
      message.error('SVG 下载失败');
    }
  }, [svg, url, label, onGenerated]);

  const handleCopy = useCallback(async () => {
    const target = normalizeUrl(url);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      message.success('链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  }, [url]);

  /** 上传已有二维码：读为 data URL 并压到 ≤512px PNG（黑白码，PNG 小且清晰） */
  const handleUploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片不能超过 5MB');
      return false;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('图片读取失败'));
        r.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
      });
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      let out = dataUrl;
      if (scale < 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        out = canvas.toDataURL('image/png');
      }
      setUploadedImage(out);
      message.success('已读取二维码图片，点击下方按钮添加到简历');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '图片读取失败');
    }
    return false; // 阻止 antd Upload 自动上传
  }, []);

  /** 把二维码写进简历底部：优先用户上传的图片，否则用当前链接现生成 */
  const handleAddToResume = useCallback(async () => {
    if (!onAddToResume) return;
    if (uploadedImage) {
      await onAddToResume({ image: uploadedImage, url: normalizeUrl(url), label });
      return;
    }
    if (!canRender) {
      message.warning('请先输入有效链接，或上传已有二维码图片');
      return;
    }
    const png = pngDataUrl || (await generateQrPngDataUrl(url));
    await onAddToResume({ image: png, url: normalizeUrl(url), label });
  }, [onAddToResume, uploadedImage, url, label, canRender, pngDataUrl]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <QrcodeOutlined />
          <span>二维码生成</span>
        </Space>
      }
      extra={
        svg ? (
          <Space>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadPng}>
              下载 PNG
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadSvg}>
              下载 SVG
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            标签（可选，如 GitHub）
          </Text>
          <Input
            value={label}
            placeholder="如：GitHub / 个人主页 / 岗位名称"
            onChange={(e) => setLabel(e.target.value)}
            maxLength={20}
            showCount
            allowClear
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            链接地址
          </Text>
          <Input
            value={url}
            placeholder="粘贴链接，如 github.com/yourname"
            onChange={(e) => setUrl(e.target.value)}
            status={error ? 'error' : undefined}
            allowClear
          />
        </div>
        {error ? <Text type="danger" style={{ fontSize: 12 }}>{error}</Text> : null}

        {suggestions && suggestions.length > 0 ? (
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>从内容中提取到：</Text>
            {suggestions.slice(0, 6).map((s) => (
              <Tag
                key={s.url}
                style={{ cursor: 'pointer', marginBottom: 4 }}
                icon={<LinkOutlined />}
                onClick={() => {
                  setUrl(s.url);
                  if (!label) setLabel(s.label);
                }}
              >
                {s.label}
              </Tag>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 200 }}>
          {svg ? (
            <div
              style={{ textAlign: 'center' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#999', paddingTop: 60 }}>
              <QrcodeOutlined style={{ fontSize: 40, display: 'block', marginBottom: 8 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {rendering ? '生成中…' : '输入链接后自动生成二维码'}
              </Text>
            </div>
          )}
        </div>

        {svg ? (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {label ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{label}</Tag> : null}
              <Text
                type="secondary"
                style={{ fontSize: 12, wordBreak: 'break-all', minWidth: 0 }}
              >
                {normalizeUrl(url)}
              </Text>
            </div>
            <Space style={{ marginTop: 10 }}>
              <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopy}>
                复制链接
              </Button>
              <Button
                size="small"
                type="text"
                icon={<SyncOutlined />}
                onClick={() => setRegenNonce((n) => n + 1)}
              >
                重新生成
              </Button>
            </Space>
          </div>
        ) : null}

        {onAddToResume ? (
          <>
            <Divider style={{ margin: '4px 0' }} />
            {existingQr ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已在简历底部
                  {existingQr.label ? `：${existingQr.label}` : ''}
                  （重新添加将覆盖）
                </Text>
                <Button size="small" type="text" danger loading={adding} onClick={() => onAddToResume(null)}>
                  移除
                </Button>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                type="primary"
                icon={<QrcodeOutlined />}
                loading={adding}
                onClick={handleAddToResume}
              >
                {uploadedImage ? '把上传的二维码添加到简历底部' : '添加到简历底部'}
              </Button>
              <Upload accept="image/*" showUploadList={false} beforeUpload={handleUploadFile}>
                <Button icon={<UploadOutlined />}>上传已有二维码</Button>
              </Upload>
            </div>
            {uploadedImage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage}
                  alt="已上传的二维码"
                  style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--border-light, #eee)', borderRadius: 6 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  将使用这张图片（覆盖当前链接生成）
                </Text>
                <Button size="small" type="text" danger onClick={() => setUploadedImage(null)}>
                  丢弃
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {!compact ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            二维码在浏览器本地生成，不上传服务端；下载 PNG 适合插入文档，SVG 可无损缩放。
          </Text>
        ) : null}
      </Space>
    </Card>
  );
}

export { collectResumeLinks };
