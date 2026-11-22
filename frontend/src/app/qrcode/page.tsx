'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Modal, Row, Skeleton, Space, Spin, Tag, Typography, message } from 'antd';
import { FileTextOutlined, QrcodeOutlined } from '@ant-design/icons';

import AppLayout from '@/components/AppLayout';
import AuthGate from '@/components/AuthGate';
import QrCodeCard, { type QrLink, type ResumeQr } from '@/components/QrCodeCard';
import { editor, optimize } from '@/lib/api';
import { collectResumeLinks } from '@/lib/qrcode';
import { getToken } from '@/lib/auth';

const { Text, Paragraph } = Typography;

const RECENT_KEY = 'qr_recent_links';
const RECENT_MAX = 8;

/** 从 axios 错误里提炼人话：优先后端 detail，网络层错误给原因码 */
function errText(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } }; code?: string; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (e?.code === 'ECONNABORTED') return '请求超时';
  if (e?.code === 'ERR_NETWORK') return '无法连接到服务（后端可能未启动或正在重启）';
  if (e?.response?.status) return `服务返回 ${e.response.status}`;
  return e?.message || '未知错误';
}

/** 列表行的展示标题：优先「姓名 · 岗位」（与历史页口径一致），逐级兜底 */
function recordTitle(r: Record<string, unknown>): string {
  if (r.job_title) {
    const oj = (r.optimized_json || {}) as { personal_info?: { name?: string } };
    const name = oj?.personal_info?.name;
    return name ? `${name} · ${r.job_title}` : String(r.job_title);
  }
  if (r.position) return String(r.position);
  const oj2 = (r.optimized_json || {}) as { personal_info?: { name?: string } };
  const name2 = oj2?.personal_info?.name;
  return name2 ? `${name2}的简历` : '未命名简历';
}

/** created_at → 'YYYY-MM-DD HH:mm'（同岗位的多条记录靠它区分） */
function recordTime(r: Record<string, unknown>): string {
  const raw = r.created_at as string | undefined;
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface RecentItem {
  url: string;
  label: string;
  at: number;
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/**
 * 二维码工具页 —— 生成、展示与下载。
 *
 * 与简历的集成：可加载任一优化记录，自动提取其中出现的链接作为候选快填；
 * 生成历史仅存本地 localStorage，不上服务端。
 */
export default function QrCodePage() {
  const [token, setToken] = useState<string | null>(null);
  const [records, setRecords] = useState<Array<{ id: string; title: string; time: string; hasQr: boolean }>>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  // 加载失败的原因与重试入口：内联展示，避免只在 toast 闪一下就消失
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [links, setLinks] = useState<QrLink[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  // 受控二维码输入：「最近生成」再次使用时回填
  const [activeUrl, setActiveUrl] = useState('');
  const [activeLabel, setActiveLabel] = useState('');
  // 「添加到简历」弹窗：pendingQr 是待写入的二维码，applyTarget 是用户选中的目标简历
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pendingQr, setPendingQr] = useState<ResumeQr | null>(null);
  const [applyTarget, setApplyTarget] = useState('');
  const [applying, setApplying] = useState(false);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      // optimize.list() 返回 AxiosResponse，简历数组在 .data 里（漏了会 map 报错）
      const res = await optimize.list();
      const list = ((res.data || []) as unknown as Array<Record<string, unknown>>);
      const mapped = list.map((r) => {
        const oj = (r.optimized_json || {}) as { qr_code?: unknown };
        return {
          id: String(r.id),
          title: recordTitle(r),
          time: recordTime(r),
          hasQr: !!oj?.qr_code,
        };
      });
      setRecords(mapped);
    } catch (err) {
      setRecordsError(errText(err));
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    setToken(t);
    setRecent(loadRecent());
    loadRecords();
  }, [token, loadRecords]);

  const handlePickResume = useCallback(async (id: string) => {
    setSelectedId(id);
    if (!id) {
      setLinks([]);
      return;
    }
    try {
      const detail = (await optimize.get(id)) as unknown as Record<string, unknown>;
      const json = (detail?.optimized_json || detail?.parsed_json || {}) as Record<string, unknown>;
      const found = collectResumeLinks(json);
      setLinks(found);
      if (found.length === 0) message.info('这份简历里没有提取到可用的链接');
    } catch (err) {
      message.error(`简历内容加载失败：${errText(err)}`);
      setLinks([]);
    }
  }, []);

  const handleGenerated = useCallback((url: string, label: string) => {
    if (!url.trim()) return;
    setRecent((prev) => {
      const next = [{ url, label, at: Date.now() }, ...prev.filter((p) => p.url !== url)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* 存储失败不阻断主流程 */
      }
      return next;
    });
  }, []);

  const handleReuse = useCallback((item: RecentItem) => {
    setActiveUrl(item.url);
    setActiveLabel(item.label);
  }, []);

  /* ── 生成后添加到简历：弹窗选简历 → 写入底部并重导出 PDF ── */

  /** 卡片「添加到简历」入口：暂存二维码并打开选简历弹窗 */
  const handleCardAddToResume = useCallback((qr: ResumeQr | null) => {
    if (!qr) return; // 工具页没有单一简历上下文，忽略移除语义
    setPendingQr(qr);
    setApplyTarget('');
    setAddModalOpen(true);
  }, []);

  /** 确认写入：与简历详情页同源（editor.setQrCode），落库即重导出 PDF */
  const handleConfirmAddToResume = useCallback(async () => {
    if (!pendingQr || !applyTarget) return;
    setApplying(true);
    try {
      const res = await editor.setQrCode(applyTarget, {
        image: pendingQr.image,
        label: pendingQr.label,
        url: pendingQr.url,
      });
      const target = records.find((r) => r.id === applyTarget);
      message.success(`二维码已添加到「${target?.title || '所选简历'}」底部，PDF 已重新生成`);
      // 本地同步 hasQr 标记，避免重开弹窗时标记滞后
      setRecords((prev) => prev.map((r) => (r.id === applyTarget ? { ...r, hasQr: true } : r)));
      setAddModalOpen(false);
      setPendingQr(null);
    } catch (err) {
      message.error(`添加失败：${errText(err)}`);
    } finally {
      setApplying(false);
    }
  }, [pendingQr, applyTarget, records]);

  if (!token) return <AuthGate activeKey="qrcode" />;

  return (
    <AppLayout activeKey="qrcode" title="二维码工具" subtitle="把链接变成二维码：本地生成，支持 PNG / SVG 下载">
      <div className="app-page-enter" style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="二维码在浏览器本地计算生成，链接不会上传到服务端"
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <QrCodeCard
              url={activeUrl}
              onUrlChange={setActiveUrl}
              label={activeLabel}
              onLabelChange={setActiveLabel}
              suggestions={links}
              onGenerated={handleGenerated}
              onAddToResume={handleCardAddToResume}
              adding={applying}
              addButtonText="添加到简历…"
            />

            <Card size="small" style={{ marginTop: 16 }} title="最近生成">
              {recent.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录，下载一次即入历史" />
              ) : (
                <List
                  size="small"
                  dataSource={recent}
                  renderItem={(item) => (
                    <List.Item
                      actions={[<a key="again" onClick={() => handleReuse(item)}>再次使用</a>]}
                    >
                      <List.Item.Meta
                        avatar={<QrcodeOutlined />}
                        title={<Text ellipsis style={{ maxWidth: 320 }}>{item.label || item.url}</Text>}
                        description={<Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{item.url}</Text>}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card
              size="small"
              title={
                <Space>
                  <FileTextOutlined />
                  <span>从简历提取链接</span>
                </Space>
              }
            >
              <Paragraph type="secondary" style={{ fontSize: 12 }}>
                选择一份优化记录，自动提取简历正文中出现的链接（GitHub、项目主页、博客等）作为候选。
              </Paragraph>
              {recordsError ? (
                <Alert
                  type="error"
                  showIcon
                  message="简历列表加载失败"
                  description={
                    <Space direction="vertical" size={4}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{recordsError}</Text>
                      <Button size="small" type="primary" onClick={loadRecords} loading={recordsLoading}>
                        重试
                      </Button>
                    </Space>
                  }
                />
              ) : recordsLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
              ) : records.length === 0 ? (
                <Empty description="暂无优化记录" />
              ) : (
                <List
                  size="small"
                  style={{ maxHeight: 420, overflow: 'auto' }}
                  dataSource={records}
                  renderItem={(r) => (
                    <List.Item
                      onClick={() => handlePickResume(r.id)}
                      style={{
                        cursor: 'pointer',
                        background: selectedId === r.id ? '#f0f5ff' : undefined,
                        borderRadius: 6,
                        padding: '6px 10px',
                      }}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={6}>
                            <Text ellipsis style={{ maxWidth: 200 }}>{r.title}</Text>
                            {selectedId === r.id ? <Tag color="blue">已选择</Tag> : null}
                          </Space>
                        }
                        description={
                          r.time ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.time}</Text>
                          ) : undefined
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* ── 添加到简历：选择目标简历弹窗 ── */}
        <Modal
          title="添加二维码到简历"
          open={addModalOpen}
          onCancel={() => { setAddModalOpen(false); setPendingQr(null) }}
          width={560}
          destroyOnHidden
          footer={[
            <Button key="cancel" onClick={() => { setAddModalOpen(false); setPendingQr(null) }}>取消</Button>,
            <Button
              key="confirm"
              type="primary"
              loading={applying}
              disabled={!applyTarget}
              onClick={handleConfirmAddToResume}
            >
              添加到所选简历底部
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {pendingQr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <QrcodeOutlined style={{ fontSize: 22, color: 'var(--primary-600)' }} />
                <Text style={{ fontSize: 13, wordBreak: 'break-all', minWidth: 0 }}>
                  {pendingQr.label ? <Tag color="blue">{pendingQr.label}</Tag> : null}
                  {pendingQr.url}
                </Text>
              </div>
            )}
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
              选择一份简历，二维码将添加到其底部并自动重新生成 PDF（已有二维码会被覆盖）。
            </Paragraph>
            {recordsLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
            ) : records.length === 0 ? (
              <Empty description="暂无简历，请先优化一份简历" />
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {records.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setApplyTarget(r.id)}
                    data-testid={`qr-target-${r.id}`}
                    style={{
                      cursor: 'pointer',
                      background: applyTarget === r.id ? '#f0f5ff' : undefined,
                      border: applyTarget === r.id ? '1px solid var(--primary-500, #6366f1)' : '1px solid transparent',
                      borderRadius: 6,
                      padding: '8px 10px',
                      marginBottom: 6,
                    }}
                  >
                    <Space size={6}>
                      <FileTextOutlined />
                      <Text ellipsis style={{ maxWidth: 300 }}>{r.title}</Text>
                      {r.hasQr ? <Tag color="orange">已有二维码</Tag> : null}
                      {applyTarget === r.id ? <Tag color="blue">已选择</Tag> : null}
                    </Space>
                    <div>
                      {r.time ? <Text type="secondary" style={{ fontSize: 12 }}>{r.time}</Text> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Space>
        </Modal>
      </div>
    </AppLayout>
  );
}
