'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Empty, Input, List, Modal, Space, Spin, Tabs, Tag, Typography, message,
} from 'antd';
import {
  CheckOutlined, CopyOutlined, DeleteOutlined, EditOutlined, MessageOutlined, PlusOutlined,
  SendOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';

import AppLayout from '@/components/AppLayout';
import AuthGate from '@/components/AuthGate';
import { polish, optimize, editor } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { countTextInJson, replaceTextInJson } from '@/lib/text-replace';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface PolishSuggestion {
  id: string;
  target: string;
  original: string;
  improved: string;
  reason: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions: PolishSuggestion[];
  streaming?: boolean;
  failed?: boolean;
}

interface SessionItem {
  id: string;
  title: string;
  target_type: string;
  updated_at: string | null;
  last_message: string;
}

const QUICK_PROMPTS = [
  '帮我把工作经历改写得更量化、更有冲击力',
  '我的个人简介太泛了，帮我聚焦到目标岗位',
  '检查项目经历里的表述，去掉弱动词',
];

/**
 * AI 对话润色页 —— 多轮对话 + 结构化建议一键应用。
 *
 * 与既有「微调」的区别：微调是一键指令式；本页是对话式，带会话历史，
 * AI 输出 suggestion 建议块，用户逐条确认后才写回简历记录。
 */
export default function PolishPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [activeTargetType, setActiveTargetType] = useState<'optimized' | 'text'>('text');
  const [activeTargetId, setActiveTargetId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 新会话弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [createTab, setCreateTab] = useState<'record' | 'text'>('record');
  const [records, setRecords] = useState<Array<{ id: string; title: string }>>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    setToken(t);
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 消息流自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await polish.listSessions();
      setSessions(res.data || []);
    } catch {
      message.error('会话列表加载失败');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const openSession = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await polish.getSession(id);
      setActiveTargetType(res.data.target_type || 'text');
      setActiveTargetId(res.data.target_id || '');
      setMessages((res.data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        suggestions: m.suggestions || [],
      })));
    } catch {
      message.error('会话加载失败');
    }
  }, []);

  const openCreateModal = useCallback(async () => {
    setCreateOpen(true);
    setRecordsLoading(true);
    try {
      const res = await optimize.list();
      setRecords((res.data || []).map((r: any) => ({
        id: String(r.id),
        title: String(r.title || r.job_title || '未命名简历'),
      })));
    } catch {
      message.error('简历记录加载失败');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const createSession = useCallback(async (targetType: 'optimized' | 'text', targetId?: string, text?: string) => {
    setCreating(true);
    try {
      const res = await polish.createSession({
        target_type: targetType,
        target_id: targetId,
        text,
        title: targetType === 'optimized' ? undefined : text?.slice(0, 20),
      });
      setCreateOpen(false);
      setPasteText('');
      await loadSessions();
      await openSession(res.data.id);
      message.success('会话已创建，开始对话吧');
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '创建会话失败');
    } finally {
      setCreating(false);
    }
  }, [loadSessions, openSession]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await polish.deleteSession(id);
      if (id === activeId) {
        setActiveId('');
        setMessages([]);
      }
      await loadSessions();
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  }, [activeId, loadSessions]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || !activeId || streaming) return;
    setInput('');
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content, suggestions: [] };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', suggestions: [], streaming: true }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';

    try {
      await polish.chat(activeId, content, {
        onDelta: (delta) => {
          acc += delta;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
        },
        onSuggestions: (items) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, suggestions: items } : m)));
        },
        onError: (errMsg) => {
          setMessages((prev) => prev.map((m) => (
            m.id === assistantId ? { ...m, failed: true, content: acc || errMsg } : m
          )));
        },
      }, controller.signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, failed: true } : m)));
      } else {
        message.error(e?.message || '对话失败');
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      void loadSessions();
    }
  }, [activeId, streaming, loadSessions]);

  const applySuggestion = useCallback(async (msgId: string, sug: PolishSuggestion) => {
    if (activeTargetType === 'optimized' && activeTargetId) {
      try {
        const res = await optimize.get(activeTargetId);
        const current = (res.data.optimized_json || {}) as Record<string, unknown>;
        const hits = countTextInJson(current, sug.original);
        if (hits === 0) {
          message.warning('原文在当前简历中已找不到（可能已被其他修改覆盖），请手动编辑');
          return;
        }
        const out = replaceTextInJson(current, sug.original, sug.improved);
        await editor.updateContent(activeTargetId, out.json);
        await editor.reexport(activeTargetId);
        message.success('已应用到简历并重新导出');
        // 标记该建议为已应用（从卡片列表移除）
        setMessages((prev) => prev.map((m) => (
          m.id === msgId ? { ...m, suggestions: m.suggestions.filter((s) => s.id !== sug.id) } : m
        )));
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '应用失败，请重试');
      }
    } else {
      // 自由文本模式：复制到剪贴板
      try {
        await navigator.clipboard.writeText(sug.improved);
        message.success('已复制改写文本');
      } catch {
        message.error('复制失败，请手动选择复制');
      }
    }
  }, [activeTargetType, activeTargetId]);

  const sidebar = useMemo(() => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={openCreateModal}
        style={{ margin: '12px 12px 8px' }}
        block
      >
        新对话
      </Button>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
        {sessionsLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
        ) : sessions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" style={{ marginTop: 40 }} />
        ) : (
          <List
            size="small"
            dataSource={sessions}
            renderItem={(s) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  borderRadius: 6,
                  padding: '6px 10px',
                  background: s.id === activeId ? '#e6f4ff' : undefined,
                  marginBottom: 4,
                }}
                onClick={() => openSession(s.id)}
                actions={[
                  <DeleteOutlined
                    key="del"
                    style={{ color: '#999' }}
                    onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={<MessageOutlined />}
                  title={<Text ellipsis style={{ maxWidth: 150, fontSize: 13 }}>{s.title}</Text>}
                  description={<Text type="secondary" ellipsis style={{ maxWidth: 150, fontSize: 12 }}>{s.last_message || '新会话'}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  ), [sessions, sessionsLoading, activeId, openSession, deleteSession, openCreateModal]);

  if (!token) return <AuthGate activeKey="polish" />;

  return (
    <AppLayout activeKey="polish" title="AI 对话润色" subtitle="对话式润色简历内容，建议逐条确认后一键应用">
      <div className="app-page-enter" style={{ display: 'flex', gap: 16, height: 'calc(100vh - 160px)', minHeight: 520 }}>
        <Card size="small" style={{ width: 240, flexShrink: 0, padding: 0 }} styles={{ body: { padding: 0 } }}>
          {sidebar}
        </Card>

        <Card size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12, minHeight: 0 } }}>
          {!activeId ? (
            <Empty
              description="选择左侧会话，或点击「新对话」开始润色"
              style={{ margin: 'auto' }}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新对话</Button>
            </Empty>
          ) : (
            <>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 12px' }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 16, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                    <Space align="start" size={8} style={{ flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                      <div
                        style={{
                          display: 'inline-block',
                          maxWidth: 560,
                          textAlign: 'left',
                          background: m.role === 'user' ? '#e6f4ff' : '#fafafa',
                          border: '1px solid #f0f0f0',
                          borderRadius: 8,
                          padding: '8px 12px',
                        }}
                      >
                        <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>
                          {m.content || (m.streaming ? '思考中…' : '')}
                        </Paragraph>
                        {m.failed ? (
                          <Alert type="warning" showIcon style={{ marginTop: 8 }} message="响应中断，已保留部分内容" />
                        ) : null}
                        {m.suggestions.map((s) => (
                          <Card
                            key={s.id}
                            size="small"
                            style={{ marginTop: 8, background: '#fffbe6', borderColor: '#ffe58f' }}
                            title={<Space><ThunderboltOutlined style={{ color: '#faad14' }} /><Text style={{ fontSize: 12 }}>建议 · {s.target}</Text></Space>}
                            extra={
                              <Button
                                size="small"
                                type="primary"
                                ghost
                                icon={<CheckOutlined />}
                                onClick={() => applySuggestion(m.id, s)}
                              >
                                {activeTargetType === 'optimized' ? '应用' : '复制'}
                              </Button>
                            }
                          >
                            <div style={{ fontSize: 12 }}>
                              <div><Text type="secondary">原文：</Text><Text delete>{s.original}</Text></div>
                              <div style={{ marginTop: 4 }}><Text type="secondary">改写：</Text><Text strong>{s.improved}</Text></div>
                              {s.reason ? <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>理由：{s.reason}</Text></div> : null}
                            </div>
                          </Card>
                        ))}
                      </div>
                    </Space>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <TextArea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        void send(input);
                      }
                    }}
                    placeholder="输入润色需求，Enter 发送，Shift+Enter 换行"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    disabled={streaming}
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={() => send(input)} loading={streaming} disabled={streaming || !input.trim()}>
                    发送
                  </Button>
                </Space.Compact>
                <div style={{ marginTop: 6 }}>
                  {QUICK_PROMPTS.map((p) => (
                    <Tag
                      key={p}
                      style={{ cursor: 'pointer', marginBottom: 4 }}
                      onClick={() => !streaming && void send(p)}
                    >
                      {p}
                    </Tag>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        title="新润色会话"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <Tabs
          activeKey={createTab}
          onChange={(k) => setCreateTab(k as 'record' | 'text')}
          items={[
            {
              key: 'record',
              label: <Space><EditOutlined />选择优化记录</Space>,
              children: recordsLoading ? (
                <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
              ) : records.length === 0 ? (
                <Empty description="暂无优化记录">
                  <Button onClick={() => { setCreateOpen(false); router.push('/'); }}>去优化</Button>
                </Empty>
              ) : (
                <List
                  style={{ maxHeight: 360, overflow: 'auto' }}
                  dataSource={records}
                  renderItem={(r) => (
                    <List.Item
                      style={{ cursor: 'pointer', borderRadius: 6, padding: '6px 10px' }}
                      onClick={() => createSession('optimized', r.id)}
                    >
                      <List.Item.Meta
                        avatar={<MessageOutlined />}
                        title={<Text ellipsis style={{ maxWidth: 420 }}>{r.title}</Text>}
                        description="AI 建议将直接应用回这条记录"
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'text',
              label: <Space><CopyOutlined />粘贴文本</Space>,
              children: (
                <div>
                  <TextArea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="粘贴要润色的简历文本（个人简介、经历描述等）"
                    autoSize={{ minRows: 6, maxRows: 12 }}
                  />
                  <Button
                    type="primary"
                    style={{ marginTop: 12 }}
                    disabled={!pasteText.trim()}
                    loading={creating}
                    onClick={() => createSession('text', undefined, pasteText)}
                  >
                    开始对话
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </AppLayout>
  );
}
