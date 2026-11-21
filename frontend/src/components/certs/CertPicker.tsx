'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Input, Button, message } from 'antd'
import {
  SearchOutlined, PlusOutlined, DownOutlined, CloseOutlined,
  CheckOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import { COMMON_CERT_GROUPS } from '@/lib/cert-options'

const ALL = '__all__'

interface Props {
  /** 已选证书名数组（受控） */
  value: string[]
  onChange: (v: string[]) => void
  maxCount?: number
}

interface PickerItem {
  name: string
  label: string
  custom?: boolean
}

/** value → 展示名（清单内用长 label，清单外原样） */
function displayName(name: string): string {
  for (const g of COMMON_CERT_GROUPS) {
    const hit = g.options.find((o) => o.value === name)
    if (hit) return hit.label
  }
  return name
}

/**
 * 证书选择器：触发框 + 弹窗（分类 Tab / 关键词搜索 / 结果列表 / 无结果新增）。
 *
 * 状态衔接规则：
 * - 打开弹窗：保留上次分类，清空搜索词 → 列表展示该分类全部证书
 * - 切分类：保留搜索词，结果 = 分类 × 关键词 双重过滤；顶部状态行明示当前口径
 * - 搜索无结果（当前口径下 0 条）：空态给出两条明确出路——
 *   ① 其他分类有匹配 → 「在全部分类中查找（N 个结果）」一键切换口径；
 *   ② 「新增『关键词』」把当前搜索内容作为自定义证书加入并自动勾选
 */
export default function CertPicker({ value, onChange, maxCount = 15 }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [custom, setCustom] = useState<string[]>([])

  const kw = search.trim().toLowerCase()
  const selected = new Set(value)

  // 打开弹窗时清空搜索（分类保留上次选择）
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((v) => v !== name))
      return
    }
    if (value.length >= maxCount) {
      message.warning(`最多选择 ${maxCount} 项证书`)
      return
    }
    onChange([...value, name])
  }

  const addCustom = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    if (!selected.has(name)) {
      if (value.length >= maxCount) {
        message.warning(`最多选择 ${maxCount} 项证书`)
        return
      }
      onChange([...value, name])
    }
    setCustom((prev) => (prev.includes(name) ? prev : [...prev, name]))
    setSearch('')
    message.success({ content: `已添加「${name}」`, key: 'certs-add' })
  }

  /** 结果列表：分类 × 关键词双重过滤；自定义证书固定追加在末组 */
  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; items: PickerItem[] }> = []
    for (const g of COMMON_CERT_GROUPS) {
      if (category !== ALL && category !== g.title) continue
      const items = g.options
        .filter((o) => !kw || o.label.toLowerCase().includes(kw) || o.value.toLowerCase().includes(kw))
        .map((o) => ({ name: o.value, label: o.label }))
      if (items.length) out.push({ key: g.label, title: g.title, items })
    }
    const customs = custom
      .filter((c) => !kw || c.toLowerCase().includes(kw))
      .map((c) => ({ name: c, label: c, custom: true }))
    if (customs.length) out.push({ key: '__custom__', title: '自定义证书', items: customs })
    return out
  }, [category, kw, custom])

  const totalResults = useMemo(
    () => groups.reduce((s, g) => s + g.items.length, 0),
    [groups],
  )

  /** 不限分类时的全局匹配数（供空态「在全部分类中查找」判断） */
  const globalCount = useMemo(() => {
    let n = custom.filter((c) => !kw || c.toLowerCase().includes(kw)).length
    for (const g of COMMON_CERT_GROUPS) {
      n += g.options.filter(
        (o) => !kw || o.label.toLowerCase().includes(kw) || o.value.toLowerCase().includes(kw),
      ).length
    }
    return n
  }, [kw, custom])

  const statusText = useMemo(() => {
    if (kw && category !== ALL) return `「${category}」中搜索「${search.trim()}」：${totalResults} 个结果`
    if (kw) return `全部分类中搜索「${search.trim()}」：${totalResults} 个结果`
    if (category !== ALL) return `${category} 分类 · ${totalResults} 项`
    return `共 ${totalResults} 项可选证书`
  }, [kw, category, totalResults, search])

  const emptyAndCanAdd = !!kw && totalResults === 0

  return (
    <>
      {/* ── 触发框 ── */}
      <div
        className="certs-picker"
        role="button"
        tabIndex={0}
        data-testid="certs-existing-select"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(true) }}
      >
        {value.length === 0 ? (
          <span className="certs-picker-placeholder">点击选择证书（支持分类浏览 / 搜索 / 新增）</span>
        ) : (
          <div className="certs-picker-chips">
            {value.map((v) => (
              <span key={v} className="certs-chip" data-testid="certs-chip">
                {displayName(v)}
                <i
                  role="button"
                  aria-label={`移除 ${displayName(v)}`}
                  onClick={(e) => { e.stopPropagation(); toggle(v) }}
                >
                  <CloseOutlined />
                </i>
              </span>
            ))}
          </div>
        )}
        <span className="certs-picker-arrow"><DownOutlined /></span>
      </div>

      {/* ── 选择弹窗 ── */}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={560}
        maskClosable
        title={(
          <span className="certs-picker-modal-title" data-testid="certs-cert-modal">
            <SafetyCertificateOutlined /> 选择已持有的证书
          </span>
        )}
      >
        <div className="certs-picker-inner">
          {/* 分类 Tab */}
          <div className="certs-picker-tabs" data-testid="certs-cert-tabs">
            <button
              type="button"
              className={category === ALL ? 'is-active' : ''}
              onClick={() => setCategory(ALL)}
            >
              全部
            </button>
            {COMMON_CERT_GROUPS.map((g) => (
              <button
                key={g.label}
                type="button"
                className={category === g.title ? 'is-active' : ''}
                onClick={() => setCategory(g.title)}
              >
                {g.title}
              </button>
            ))}
          </div>

          {/* 搜索 */}
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--text-quaternary)' }} />}
            placeholder="搜索证书关键词，如：四级、PMP、华为"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && emptyAndCanAdd) addCustom(search)
            }}
            data-testid="certs-cert-search"
          />

          {/* 状态行：明示当前过滤口径 */}
          <div className="certs-picker-status">{statusText}</div>

          {/* 结果列表 */}
          <div className="certs-picker-body" data-testid="certs-cert-list">
            {groups.map((g) => (
              <div key={g.key} className="certs-picker-group">
                <div className="certs-picker-group-title">{g.title}</div>
                {g.items.map((it) => {
                  const isSel = selected.has(it.name)
                  return (
                    <button
                      key={it.name}
                      type="button"
                      className={`certs-picker-item${isSel ? ' is-selected' : ''}`}
                      onClick={() => toggle(it.name)}
                      data-testid={it.custom ? 'certs-cert-item-custom' : 'certs-cert-item'}
                    >
                      <span className="certs-picker-check"><CheckOutlined /></span>
                      <span className="certs-picker-item-label">{it.label}</span>
                      {it.custom && <span className="certs-picker-custom-tag">自定义</span>}
                    </button>
                  )
                })}
              </div>
            ))}

            {/* 空态：无匹配 → 提供换口径 / 新增两条出路 */}
            {emptyAndCanAdd && (
              <div className="certs-picker-empty" data-testid="certs-cert-empty">
                <p>
                  没有找到与「{search.trim()}」相关的证书
                  {category !== ALL ? `（当前分类：${category}）` : ''}
                </p>
                <div className="certs-picker-empty-actions">
                  {category !== ALL && globalCount > 0 && (
                    <Button onClick={() => setCategory(ALL)} data-testid="certs-cert-search-all">
                      在全部分类中查找「{search.trim()}」（{globalCount} 个结果）
                    </Button>
                  )}
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => addCustom(search)}
                    data-testid="certs-cert-add"
                  >
                    新增「{search.trim()}」
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 底部：已选统计 + 清空 / 确定 */}
          <div className="certs-picker-foot">
            <span className="certs-picker-foot-count" data-testid="certs-cert-count">
              已选 {value.length}/{maxCount}
            </span>
            <div className="certs-picker-foot-actions">
              {value.length > 0 && (
                <Button size="small" onClick={() => onChange([])} data-testid="certs-cert-clear">
                  清空
                </Button>
              )}
              <Button type="primary" size="small" onClick={() => setOpen(false)}>
                确定
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        .certs-picker {
          display: flex; align-items: flex-start; gap: 8px;
          min-height: 40px; padding: 5px 10px;
          border-radius: 10px;
          border: 1px solid var(--border-medium);
          background: var(--bg-card);
          cursor: pointer;
          transition: border-color .18s var(--ease-out), box-shadow .18s var(--ease-out);
        }
        .certs-picker:hover, .certs-picker:focus-visible {
          border-color: var(--primary-500);
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.10);
        }
        .certs-picker-placeholder {
          align-self: center; font-size: 14px; color: var(--text-quaternary);
        }
        .certs-picker-chips {
          flex: 1; min-width: 0;
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .certs-chip {
          display: inline-flex; align-items: center; gap: 5px;
          max-width: 100%;
          padding: 3px 6px 3px 10px;
          border-radius: 8px;
          font-size: 12.5px; font-weight: 500; line-height: 1.6;
          color: var(--primary-500);
          background: rgba(0, 122, 255, 0.10);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        [data-theme='dark'] .certs-chip { color: #6FAFFF; }
        .certs-chip i {
          flex: none; width: 16px; height: 16px; border-radius: 5px;
          display: grid; place-items: center;
          font-size: 9px; font-style: normal;
          color: inherit; background: rgba(0, 122, 255, 0.14);
          transition: background .15s ease;
        }
        .certs-chip i:hover { background: rgba(0, 122, 255, 0.30); color: #fff; }
        .certs-picker-arrow {
          flex: none; align-self: center;
          font-size: 11px; color: var(--text-quaternary);
        }
      `}</style>

      {/* Modal 内容挂在 portal，必须 :global（certs-picker- 前缀防污染） */}
      <style jsx global>{`
        .certs-picker-modal-title {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 650;
        }
        .certs-picker-inner { display: flex; flex-direction: column; gap: 12px; }
        .certs-picker-tabs {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .certs-picker-tabs button {
          border: 1px solid var(--border-light);
          background: var(--bg-card);
          color: var(--text-secondary);
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 12.5px;
          cursor: pointer;
          transition: all .15s ease;
        }
        .certs-picker-tabs button:hover {
          border-color: var(--primary-500);
          color: var(--primary-500);
        }
        .certs-picker-tabs button.is-active {
          background: var(--primary-500);
          border-color: var(--primary-500);
          color: #fff;
          font-weight: 600;
        }
        .certs-picker-status {
          font-size: 12px; color: var(--text-tertiary);
          display: flex; align-items: center; gap: 6px;
        }
        .certs-picker-body {
          max-height: 340px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 12px;
          padding-right: 4px;
        }
        .certs-picker-group-title {
          font-size: 11.5px; font-weight: 600;
          color: var(--text-tertiary);
          text-transform: none;
          letter-spacing: .3px;
          margin-bottom: 6px;
        }
        .certs-picker-item {
          display: flex; align-items: center; gap: 9px;
          width: 100%;
          padding: 7px 10px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: background .15s ease, border-color .15s ease;
        }
        .certs-picker-item:hover { background: var(--bg-hover); }
        .certs-picker-item.is-selected {
          background: rgba(0, 122, 255, 0.08);
          border-color: rgba(0, 122, 255, 0.30);
        }
        .certs-picker-check {
          flex: none; width: 17px; height: 17px;
          border-radius: 6px;
          border: 1.5px solid var(--border-medium);
          display: grid; place-items: center;
          font-size: 10px; color: transparent;
          transition: all .15s ease;
        }
        .certs-picker-item.is-selected .certs-picker-check {
          background: var(--primary-500);
          border-color: var(--primary-500);
          color: #fff;
        }
        .certs-picker-item-label { flex: 1; min-width: 0; }
        .certs-picker-custom-tag {
          flex: none;
          font-size: 10.5px; font-weight: 600;
          padding: 1px 7px; border-radius: 999px;
          color: #5E5CE6; background: rgba(94, 92, 230, 0.13);
        }
        [data-theme='dark'] .certs-picker-custom-tag { color: #A5A3F5; }
        .certs-picker-empty {
          text-align: center;
          padding: 26px 16px;
          border: 1px dashed var(--border-medium);
          border-radius: 12px;
        }
        .certs-picker-empty p {
          margin: 0 0 14px; font-size: 13px;
          color: var(--text-secondary); line-height: 1.7;
          word-break: break-all;
        }
        .certs-picker-empty-actions {
          display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;
        }
        .certs-picker-foot {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 4px;
          border-top: 1px solid var(--border-light);
        }
        .certs-picker-foot-count { font-size: 12px; color: var(--text-tertiary); }
        .certs-picker-foot-actions { display: flex; gap: 8px; }
      `}</style>
    </>
  )
}
