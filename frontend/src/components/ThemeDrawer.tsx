'use client'

/**
 * 主题定制抽屉（问题 6 前端入口）。
 *
 * 与模板选择正交：模板决定「结构」，主题决定「配色/字体/字号/行距/边距/章节间距」。
 * 抽屉内的实时预览与 PDF 导出走同一条渲染链（/api/templates/{id}/preview 带主题参数
 * → render_template_html + resume_theme.normalize_theme_config），保证「预览所见 =
 * 导出所得」。保存即 PUT /api/optimize/{id}/theme（落库），可选立即重导出。
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  Drawer, ColorPicker, Select, Slider, Button, Space, Typography, Tag, message, Tooltip,
} from 'antd'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { TemplateRegistry } from '@/lib/template-registry'
import { editor } from '@/lib/api'

/** 字体白名单（与后端 resume_theme.FONT_WHITELIST 一致） */
const FONT_OPTIONS = [
  { value: 'Noto Sans SC', label: '思源黑体（默认）' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'PingFang SC', label: '苹方' },
  { value: 'SimSun', label: '宋体' },
  { value: 'SimHei', label: '黑体' },
  { value: 'Source Han Serif SC', label: '思源宋体' },
  { value: 'Alibaba PuHuiTi', label: '阿里普惠体' },
]

export interface ThemeForm {
  primary: string
  accent: string
  fontFamily: string
  baseFontSizePt: number
  lineHeight: number
  marginMm: number
  sectionGapMm: number
}

interface ThemeDrawerProps {
  open: boolean
  onClose: () => void
  recordId: string
  /** 记录当前模板（预览与主题基线都按它来） */
  templateId: string
  /** 记录已保存的主题定制（部分字段或 null） */
  initial: Record<string, unknown> | null
  /** 保存成功（已落库）后回调，用于刷新详情 */
  onSaved: () => void
}

/** 模板默认 ← 记录定制，合并出抽屉初始值 */
function buildInitialForm(templateId: string, initial: Record<string, unknown> | null): ThemeForm {
  const meta = TemplateRegistry.get(templateId)
  const td = meta?.textDefaults
  const form: ThemeForm = {
    primary: meta?.theme.primary || '#2c6fbb',
    accent: meta?.theme.secondary || '#1a5276',
    fontFamily: td?.fontFamily || 'Noto Sans SC',
    baseFontSizePt: td?.baseFontSizePt ?? 10.5,
    lineHeight: td?.lineHeight ?? 1.6,
    marginMm: meta?.layoutFeatures.pageMarginYMm ?? 15,
    sectionGapMm: td?.sectionGapMm ?? 6,
  }
  if (initial) {
    const target = form as unknown as Record<string, string | number>
    for (const key of Object.keys(form) as (keyof ThemeForm)[]) {
      const v = initial[key]
      if (typeof v === 'string' || typeof v === 'number') {
        target[key] = v
      }
    }
  }
  return form
}

export default function ThemeDrawer({
  open, onClose, recordId, templateId, initial, onSaved,
}: ThemeDrawerProps) {
  const meta = TemplateRegistry.get(templateId)
  const [form, setForm] = useState<ThemeForm>(() => buildInitialForm(templateId, initial))
  const [saving, setSaving] = useState(false)

  // 抽屉重新打开 / 记录切换时重置表单
  useEffect(() => {
    if (open) setForm(buildInitialForm(templateId, initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId])

  const set = <K extends keyof ThemeForm>(key: K, value: ThemeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /** 实时预览 URL：与导出同一定值函数（预览端点带主题离散参数） */
  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      primary: form.primary,
      accent: form.accent,
      font_family: form.fontFamily,
      base_font_size: String(form.baseFontSizePt),
      line_height: String(form.lineHeight),
      section_gap: String(form.sectionGapMm),
    })
    return `/api/templates/${templateId}/preview?${params.toString()}`
  }, [templateId, form])

  const fullBleed = !!meta?.layoutFeatures.fullBleedHeader

  const handleSave = async () => {
    setSaving(true)
    try {
      await editor.setTheme(recordId, { ...form })
      message.success('主题已保存，PDF 已按新主题重新导出')
      onSaved()
      onClose()
    } catch (e) {
      message.error(`保存失败：${(e as Error)?.message || '请稍后重试'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setForm(buildInitialForm(templateId, null))
    message.info('已恢复模板默认主题，记得保存')
  }

  return (
    <Drawer
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          主题定制
          <Tag style={{ fontSize: 11 }}>{meta?.name || templateId}</Tag>
        </span>
      }
      open={open}
      onClose={onClose}
      width={460}
      styles={{ body: { paddingBottom: 24 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>恢复模板默认</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存并重新导出
          </Button>
        </div>
      }
    >
      {/* ── 实时预览（与导出同链） ── */}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        实时预览（演示数据，与 PDF 导出同一渲染链）
      </Typography.Text>
      <iframe
        key={previewUrl}
        title="主题实时预览"
        src={previewUrl}
        loading="lazy"
        style={{
          width: '100%',
          height: 300,
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 8,
          margin: '8px 0 16px',
          background: '#fff',
        }}
      />

      {/* ── 配色 ── */}
      <Typography.Text strong>主色 / 辅色</Typography.Text>
      <div style={{ display: 'flex', gap: 16, margin: '8px 0 16px' }}>
        <div>
          <ColorPicker
            value={form.primary}
            onChangeComplete={(c) => set('primary', c.toHexString())}
          />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>主色（标题/边框/强调）</div>
        </div>
        <div>
          <ColorPicker
            value={form.accent}
            onChangeComplete={(c) => set('accent', c.toHexString())}
          />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>辅色（渐变/次级强调）</div>
        </div>
      </div>

      {/* ── 字体 ── */}
      <Typography.Text strong>字体</Typography.Text>
      <Select
        value={form.fontFamily}
        onChange={(v) => set('fontFamily', v)}
        options={FONT_OPTIONS}
        style={{ width: '100%', margin: '8px 0 16px' }}
      />

      {/* ── 字号 ── */}
      <Typography.Text strong>正文字号（{form.baseFontSizePt}pt）</Typography.Text>
      <Slider
        min={8}
        max={16}
        step={0.5}
        value={form.baseFontSizePt}
        onChange={(v) => set('baseFontSizePt', v)}
        marks={{ 8: '8', 12: '12', 16: '16' }}
      />

      {/* ── 行距 ── */}
      <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>行距（{form.lineHeight}）</Typography.Text>
      <Slider
        min={1.1}
        max={2}
        step={0.05}
        value={form.lineHeight}
        onChange={(v) => set('lineHeight', v)}
        marks={{ 1.1: '紧凑', 1.6: '适中', 2: '宽松' }}
      />

      {/* ── 章节间距 ── */}
      <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>
        章节间距（{form.sectionGapMm}mm）
      </Typography.Text>
      <Slider
        min={0}
        max={20}
        step={0.5}
        value={form.sectionGapMm}
        onChange={(v) => set('sectionGapMm', v)}
        marks={{ 0: '0', 10: '10', 20: '20' }}
      />

      {/* ── 页边距 ── */}
      <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>
        页边距（{form.marginMm}mm）
      </Typography.Text>
      {fullBleed ? (
        <Tooltip title="该模板为全幅头部设计，背景条需顶到纸边，页边距固定为 0">
          <Slider disabled value={0} marks={{ 0: '全幅模板固定 0' }} />
        </Tooltip>
      ) : (
        <Slider
          min={0}
          max={30}
          step={1}
          value={form.marginMm}
          onChange={(v) => set('marginMm', v)}
          marks={{ 0: '0', 15: '15', 30: '30' }}
        />
      )}
      <Space direction="vertical" size={4} style={{ marginTop: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          保存后主题随记录落库（theme_config），刷新/换设备不丢失；
          再次导出 PDF 时自动应用，PDF 文档属性含主题摘要。
        </Typography.Text>
      </Space>
    </Drawer>
  )
}
