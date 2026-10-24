'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Col, Empty, List, Row, Skeleton, Space, Tag, Typography, message } from 'antd';
import { FileTextOutlined, QrcodeOutlined } from '@ant-design/icons';

import AppLayout from '@/components/AppLayout';
import AuthGate from '@/components/AuthGate';
import QrCodeCard, { type QrLink } from '@/components/QrCodeCard';
import { optimize } from '@/lib/api';
import { collectResumeLinks } from '@/lib/qrcode';
import { getToken } from '@/lib/auth';

const { Text, Paragraph } = Typography;

const RECENT_KEY = 'qr_recent_links';
const RECENT_MAX = 8;

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
  const [records, setRecords] = useState<Array<{ id: string; title: string }>>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [links, setLinks] = useState<QrLink[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  // 受控二维码输入：「最近生成」再次使用时回填
  const [activeUrl, setActiveUrl] = useState('');
  const [activeLabel, setActiveLabel] = useState('');

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    setToken(t);
    setRecent(loadRecent());
    (async () => {
      setRecordsLoading(true);
      try {
        const list = (await optimize.list()) as unknown as Array<Record<string, unknown>>;
        const mapped = (list || []).map((r) => ({
          id: String(r.id),
          title: String(r.title || r.position || '未命名简历'),
        }));
        setRecords(mapped);
      } catch {
        message.error('简历列表加载失败');
      } finally {
        setRecordsLoading(false);
      }
    })();
  }, []);

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
    } catch {
      message.error('简历内容加载失败');
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
              {recordsLoading ? (
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
                      <Space>
                        <Text ellipsis style={{ maxWidth: 220 }}>{r.title}</Text>
                        {selectedId === r.id ? <Tag color="blue">已选择</Tag> : null}
                      </Space>
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>
        </Row>
      </div>
    </AppLayout>
  );
}
