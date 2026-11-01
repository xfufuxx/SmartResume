'use client'

/**
 * PolishDock —— AI 润色悬浮窗（编辑器内常驻 FAB + 对话面板）。
 *
 * 智能感知：
 * - 每次发送消息都携带 getDraft() 返回的编辑器当前草稿（未保存的编辑也生效），
 *   后端据此刷新 context_snapshot，AI 看到的始终是"正在编辑的版本"；
 * - 建议卡片「应用」经 onApply 写回编辑器草稿（编辑态）或直接落库+重导出（查看态）。
 *
 * 会话：按 targetId 过滤历史会话，首次打开自动续接最近一次或新建；
 * 面板内可切换历史会话 / 开新对话。SSE 协议见 lib/api.ts polish.chat。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Empty, Input, Spin, Tooltip, message } from 'antd'
import {
  CloseOutlined, CommentOutlined, PlusOutlined, RobotOutlined, SendOutlined,
} from '@ant-design/icons'
import { polish } from '@/lib/api'
import type { PolishSuggestion } from '@/lib/api'

interface DockMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions?: PolishSuggestion[]
  /** 已成功应用的 suggestion id（防重复应用） */
  applied?: string[]
  streaming?: boolean
}

interface PolishDockProps {
  /** 绑定的优化记录 ID */
  targetId: string
  /** 面板标题副文案（岗位名等） */
  targetTitle?: string
  /** 返回编辑器当前草稿（optimized_json）；每次发送消息时调用 */
  getDraft: () => Record<string, unknown> | null
  /** 应用一条建议到编辑器；返回 false 表示失败（如原文已被改掉） */
  onApply: (original: string, improved: string) => Promise<boolean>
}

let _msgSeq = 0
const nextMsgId = () => `dock-msg-${++_msgSeq}-${Date.now()}`

export default function PolishDock({ targetId, targetTitle, getDraft, onApply }: PolishDockProps) {
  const [open, setOpen] = useState(false)
  const [booting, setBooting] = useState(false)   // 首次打开：定位/创建会话
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([])
  const [messages, setMessages] = useState<DockMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const appliedRef = useRef<Set<string>>(new Set())   // 本地已应用（跨消息去重展示）
  const openRef = useRef(open)
  openRef.current = open

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  /** 定位会话：优先续接本记录最近一次会话，否则新建 */
  const ensureSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await polish.listSessions()
      const all = (res.data || []) as Array<{ id: string; title: string; target_type: string; target_id?: string | null }>
      const mine = all.filter((s) => s.target_type === 'optimized' && s.target_id === targetId)
      setSessions(mine)
      if (mine.length) return mine[0].id
      const created = await polish.createSession({ target_type: 'optimized', target_id: targetId })
      const sid = (created.data as { id?: string })?.id || null
      if (sid) setSessions((prev) => [{ id: sid, title: '润色会话' }, ...prev])
      return sid
    } catch {
      return null
    }
  }, [targetId])

  const loadMessages = useCallback(async (sid: string) => {
    try {
      const res = await polish.getSession(sid)
      const data = res.data as { messages?: Array<{ id: string; role: string; content: string; suggestions?: PolishSuggestion[] }> }
      appliedRef.current = new Set()
      setMessages(
        (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          suggestions: m.suggestions || undefined,
        })),
      )
      scrollBottom()
    } catch { /* 静默：显示空会话 */ }
  }, [scrollBottom])

  // 首次打开：定位会话并加载消息
  useEffect(() => {
    if (!open || sessionId || booting) return
    setBooting(true)
    ensureSession()
      .then(async (sid) => {
        if (sid) {
          setSessionId(sid)
          await loadMessages(sid)
        }
      })
      .finally(() => setBooting(false))
  }, [open, sessionId, booting, ensureSession, loadMessages])

  // 组件随记录切换重置
  useEffect(() => {
    setSessionId(null)
    setMessages([])
    setSessions([])
    appliedRef.current = new Set()
  }, [targetId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const switchSession = async (sid: string) => {
    if (sending) return
    setSessionId(sid)
    setMessages([])
    await loadMessages(sid)
  }

  const newSession = async () => {
    if (sending) return
    try {
      const created = await polish.createSession({ target_type: 'optimized', target_id: targetId })
      const sid = (created.data as { id?: string })?.id
      if (!sid) throw new Error()
      setSessions((prev) => [{ id: sid, title: '润色会话' }, ...prev])
      setSessionId(sid)
      setMessages([])
      appliedRef.current = new Set()
    } catch {
      message.error('创建会话失败')
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    let sid = sessionId
    if (!sid) {
      sid = await ensureSession()
      if (!sid) { message.error('会话不可用，请稍后重试'); return }
      setSessionId(sid)
    }
    const userMsg: DockMessage = { id: nextMsgId(), role: 'user', content: text }
    const aiMsg: DockMessage = { id: nextMsgId(), role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setInput('')
    setSending(true)
    abortRef.current = new AbortController()
    const patch = (fn: (m: DockMessage) => DockMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === aiMsg.id ? fn(m) : m)))
    try {
      await polish.chat(
        sid,
        text,
        {
          onDelta: (t) => patch((m) => ({ ...m, content: m.content + t })),
          onSuggestions: (items) => patch((m) => ({ ...m, suggestions: items.length ? items : undefined })),
          onDone: () => patch((m) => ({ ...m, streaming: false })),
          onError: (msg) => patch((m) => ({ ...m, streaming: false, content: m.content || `⚠️ ${msg}` })),
        },
        abortRef.current.signal,
        getDraft(),   // 智能感知：携带编辑器当前草稿
      )
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        patch((m) => ({ ...m, streaming: false, content: m.content || '⚠️ 网络异常，请稍后重试' }))
      } else {
        patch((m) => ({ ...m, streaming: false }))
      }
    } finally {
      setSending(false)
      abortRef.current = null
      scrollBottom()
    }
  }

  const applySuggestion = async (msgId: string, sug: PolishSuggestion) => {
    if (appliedRef.current.has(sug.id)) return
    const ok = await onApply(sug.original, sug.improved)
    if (ok) {
      appliedRef.current.add(sug.id)
      setMessages((prev) => prev.map((m) => (
        m.id === msgId ? { ...m, applied: [...(m.applied || []), sug.id] } : m
      )))
    }
  }

  return (
    <>
      {/* 悬浮按钮 */}
      <Tooltip title={open ? '收起 AI 润色助手' : 'AI 润色助手：感知当前编辑内容，对话式改简历'} placement="left">
        <button
          type="button"
          className="polish-dock-fab"
          data-testid="polish-dock-fab"
          onClick={() => setOpen((v) => !v)}
          aria-label="AI 润色助手"
        >
          {open ? <CloseOutlined /> : <Badge dot={!open && messages.some((m) => m.role === 'assistant')}><RobotOutlined /></Badge>}
        </button>
      </Tooltip>

      {/* 对话面板 */}
      {open && (
        <div className="polish-dock-panel" data-testid="polish-dock-panel">
          <div className="polish-dock-head">
            <div className="polish-dock-head-title">
              <RobotOutlined style={{ color: 'var(--primary-500)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>AI 润色助手</div>
                {targetTitle && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>感知对象：{targetTitle}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {sessions.length > 1 && (
                <select
                  className="polish-dock-session-select"
                  data-testid="polish-dock-sessions"
                  value={sessionId || ''}
                  onChange={(e) => switchSession(e.target.value)}
                  aria-label="切换历史会话"
                >
                  {sessions.map((s, i) => (
                    <option key={s.id} value={s.id}>{s.title || `会话 ${sessions.length - i}`}</option>
                  ))}
                </select>
              )}
              <Tooltip title="开新对话">
                <Button size="small" type="text" icon={<PlusOutlined />} data-testid="polish-dock-new" onClick={newSession} />
              </Tooltip>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
            </div>
          </div>

          <div className="polish-dock-body" ref={bodyRef} data-testid="polish-dock-messages">
            {booting ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : messages.length === 0 ? (
              <div className="polish-dock-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      和 AI 聊聊怎么改这份简历吧<br />它会读取你正在编辑的最新内容
                    </span>
                  }
                />
                <div className="polish-dock-quick">
                  {['帮我润色个人总结', '让项目经历更有量化成果', '检查有没有口语化表达'].map((q) => (
                    <button key={q} type="button" className="polish-dock-quick-btn" onClick={() => setInput(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`polish-dock-msg ${m.role}`}>
                  <div className="polish-dock-bubble">{m.content || (m.streaming ? '…' : '')}</div>
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="polish-dock-sugs">
                      {m.suggestions.map((sug) => {
                        const applied = (m.applied || []).includes(sug.id) || appliedRef.current.has(sug.id)
                        return (
                          <div key={sug.id} className="polish-dock-sug" data-testid="polish-dock-suggestion">
                            <div className="polish-dock-sug-text">
                              <div className="polish-dock-sug-old">{sug.original}</div>
                              <div className="polish-dock-sug-new">{sug.improved}</div>
                              {sug.reason && <div className="polish-dock-sug-reason">{sug.reason}</div>}
                            </div>
                            <Button
                              size="small"
                              type={applied ? 'default' : 'primary'}
                              disabled={applied}
                              data-testid="polish-dock-apply"
                              onClick={() => applySuggestion(m.id, sug)}
                            >
                              {applied ? '已应用' : '应用'}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="polish-dock-input">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={send}
              placeholder="告诉 AI 想改哪里…"
              size="small"
              disabled={sending}
              data-testid="polish-dock-input"
            />
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={sending}
              onClick={send}
              data-testid="polish-dock-send"
            />
          </div>
        </div>
      )}
    </>
  )
}
