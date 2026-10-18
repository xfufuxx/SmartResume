'use client'

import React from 'react'
import {
  FileTextOutlined, BulbOutlined, StarFilled,
  ThunderboltOutlined, CrownOutlined,
  RocketOutlined, ExperimentOutlined, HighlightOutlined,
  GlobalOutlined, FireOutlined, LayoutOutlined, ReadOutlined,
} from '@ant-design/icons'
import type { TemplateOption } from '@/components/TemplateSelector'

/**
 * 全站唯一的简历模板清单（优化页 / 优化详情页共用）。
 * key 与后端 backend/app/templates/{key}.html 一一对应；
 * 新增模板时须同步：本清单 + 后端 HTML 文件 + optimization.py::_ALLOWED_TEMPLATES
 * + pdf_styler.py::JINJA2_STYLE_TEMPLATES。
 */
export const TEMPLATE_OPTIONS: TemplateOption[] = [
  { key: 'professional', label: '专业分栏', icon: <FileTextOutlined />, preview: { primary: '#2c6fbb', secondary: '#1a5276', bg: '#fff', text: '#333', layout: 'dual', desc: '蓝色主题双栏布局，左侧联系信息右侧工作经历' } },
  { key: 'simple', label: '简约单栏', icon: <BulbOutlined />, preview: { primary: '#444', secondary: '#ddd', bg: '#fff', text: '#444', layout: 'single', desc: '极简单栏居中，浅灰色调，适合内容简洁的简历' } },
  { key: 'modern', label: '现代渐变', icon: <StarFilled />, preview: { primary: '#2c6fbb', secondary: '#3498db', bg: '#fff', text: '#333', layout: 'banner', desc: '蓝色渐变顶部横幅，左侧技能标签右侧工作经历' } },
  { key: 'ocean', label: '海洋之蓝', icon: <GlobalOutlined />, preview: { primary: '#0e7490', secondary: '#0c4a6e', bg: '#f0f9ff', text: '#334155', layout: 'banner', desc: '青蓝渐变顶部，清爽干练，适合互联网与制造业岗位' } },
  { key: 'sunset', label: '暖阳落日', icon: <FireOutlined />, preview: { primary: '#ea580c', secondary: '#9a3412', bg: '#fffbeb', text: '#44403c', layout: 'banner', desc: '暖橙渐变顶部，亲和有活力，适合运营市场与创意岗位' } },
  { key: 'violet', label: '紫韵流光', icon: <LayoutOutlined />, preview: { primary: '#7c3aed', secondary: '#4c1d95', bg: '#faf5ff', text: '#3f3f46', layout: 'dual', desc: '深紫侧边栏+时间轴条目，兼具设计感与专业性' } },
  { key: 'academic', label: '学术严谨', icon: <ReadOutlined />, preview: { primary: '#1e3a5f', secondary: '#6b7280', bg: '#fff', text: '#1f2937', layout: 'single', desc: '衬线字体单栏版式，双线页眉，适合学术、国企与严肃场合' } },
  { key: 'compact', label: '紧凑高效', icon: <ThunderboltOutlined />, preview: { primary: '#111', secondary: '#333', bg: '#fff', text: '#333', layout: 'single', desc: '最大信息密度，时间线排版，适合内容丰富的简历' } },
  { key: 'elegant', label: '优雅金边', icon: <CrownOutlined />, preview: { primary: '#c9a962', secondary: '#2d2d2d', bg: '#fff', text: '#3a3a3a', layout: 'dual', desc: '深色侧边栏+金色点缀，高端商务风格' } },
  { key: 'dark', label: '深色科技', icon: <RocketOutlined />, preview: { primary: '#00d4ff', secondary: '#0d1117', bg: '#0d1117', text: '#e0e0e0', layout: 'dark', desc: '深色背景+霓虹蓝点缀，科技感十足，适合技术岗' } },
  { key: 'fresh', label: '清新绿意', icon: <ExperimentOutlined />, preview: { primary: '#2d6a4f', secondary: '#52b788', bg: '#fafcf8', text: '#3a5a40', layout: 'banner', desc: '绿色渐变顶部，自然清新风格，双栏布局' } },
  { key: 'classic', label: '经典黑白', icon: <HighlightOutlined />, preview: { primary: '#000', secondary: '#555', bg: '#fff', text: '#1a1a1a', layout: 'single', desc: '黑白极简，传统正式风格，粗线分隔，适合严肃场合' } },
]

/** 取模板 key → 展示名（下拉 / 按钮文案等非卡片场景使用） */
export const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_OPTIONS.map((t) => [t.key, t.label]),
)

export const DEFAULT_TEMPLATE = 'professional'
