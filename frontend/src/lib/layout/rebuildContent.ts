/**
 * rebuildContent —— 从布局文档反推简历内容（行内编辑的持久化桥梁）。
 *
 * 存在的原因：行内编辑改的是 block.contentRef.payload（渲染快照，预览与
 * 导出都以它为准）。用户点「保存」时，这些改动需要回写到 optimized_json，
 * 否则详情页的表单/对比区会停留在旧内容，与画布上看到的不一致。
 *
 * 边界（重要）：
 * - header / contact 的 payload 属于 personal_info：后端 PUT /content 明确
 *   保护该字段（不允许经编辑接口篡改身份信息），且 layout_json 的 payload
 *   对导出 PDF 已是唯一真相——因此个人信息的行内改动只进布局层，不回写。
 * - section / divider 的 payload 是结构快照（标题/计数），不是数据，跳过。
 *
 * 本文件零依赖（不 import React / antd），node:test 可直接测。
 */

import type { Block, LayoutDocument } from './types.ts';

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 'experience[0].points' → ['experience', '0', 'points'] */
export function parsePath(source: string): string[] {
  if (!source) return [];
  return source
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

/** 按路径写入；merge=true 且两端都是对象时浅合并（不丢 base 的其它键） */
function setPath(root: Json, path: string[], value: unknown, merge = false): void {
  if (path.length === 0) return;
  let node: Json = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const wantArray = /^\d+$/.test(path[i + 1]);
    if (!isPlainObject(node[key]) && !Array.isArray(node[key])) {
      node[key] = wantArray ? [] : {};
    }
    node = node[key] as Json;
  }
  const last = path[path.length - 1];
  if (merge && isPlainObject(node[last]) && isPlainObject(value)) {
    node[last] = { ...node[last], ...value };
  } else {
    node[last] = value;
  }
}

/** 块 → 回写目标（path + 值 + 是否合并）。返回 null = 该块不回写 */
function contentTargetOf(block: Block): { path: string[]; value: unknown; merge?: boolean } | null {
  const p = block.contentRef.payload;
  if (p == null) return null;

  switch (block.type) {
    case 'header':
    case 'contact':
      // personal_info 受后端保护，只进布局层（见文件头说明）
      return null;
    case 'section':
    case 'divider':
      // 结构块：payload 是标题/计数快照，非数据
      return null;
    case 'summary': {
      const text = isPlainObject(p) ? p.summary : p;
      return { path: ['summary'], value: typeof text === 'string' ? text : '' };
    }
    case 'skill-group': {
      const skills = isPlainObject(p) ? p.skills : p;
      return { path: ['skills'], value: Array.isArray(skills) ? skills : [] };
    }
    case 'item': {
      const path = parsePath(block.contentRef.source);
      return path.length ? { path, value: p } : null;
    }
    case 'text': {
      const path = parsePath(block.contentRef.source);
      if (!path.length) return null;
      const text = isPlainObject(p) ? p.text : p;
      return { path, value: typeof text === 'string' ? text : '' };
    }
    case 'avatar': {
      const path = parsePath(block.contentRef.source);
      return path.length ? { path, value: p } : null;
    }
    default:
      return null;
  }
}

/**
 * 布局文档 → 简历内容。
 * base 是当前库里的 optimized_json（详情页持有），所有未被行内编辑触及的
 * 字段原样保留；被编辑过的块按 source 路径覆写。
 */
export function rebuildContent(doc: LayoutDocument, base: Json): Json {
  const out = deepClone(base);
  for (const block of doc.blocks) {
    const target = contentTargetOf(block);
    if (!target) continue;
    setPath(out, target.path, target.value, target.merge);
  }
  return out;
}

/**
 * 本次会话内容是否被改过（对比 doc 与 initialDoc 的 payload）。
 * 纯布局变更（位移/缩放/显隐）不算——那样就不会触发多余的 /content 请求。
 */
export function hasContentChanges(doc: LayoutDocument, initialDoc: LayoutDocument): boolean {
  if (doc === initialDoc) return false;
  const initialById = new Map(initialDoc.blocks.map((b) => [b.id, b]));
  for (const b of doc.blocks) {
    const init = initialById.get(b.id);
    if (!init) return true; // 新增块（多页/复制）视为内容变化
    if (JSON.stringify(b.contentRef) !== JSON.stringify(init.contentRef)) return true;
  }
  return initialById.size !== doc.blocks.length;
}

/** 字符串数组去空白、去空项 */
function cleanList(list: unknown): unknown[] {
  if (!Array.isArray(list)) return [];
  return list.map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '');
}

/** 深度 trim：对象/数组里的所有字符串（行内编辑常带出尾随空格） */
function trimDeep(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (isPlainObject(value)) {
    const out: Json = {};
    for (const [k, v] of Object.entries(value)) out[k] = trimDeep(v);
    return out;
  }
  return value;
}

/**
 * 保存前清洗：与详情页「编辑内容」的清洗规则一致（trim 要点、去掉空条目、
 * 去掉空技能），避免导出出现空白要点。只动已知结构键，其余字段原样。
 */
export function cleanResumeContent(resume: Json): Json {
  const out: Json = { ...resume };
  if (Array.isArray(out.experience)) {
    out.experience = (out.experience as Json[])
      .map((e) => (isPlainObject(e) ? (trimDeep(e) as Json) : e))
      .filter((e) => isPlainObject(e) && (e.title || e.company))
      .map((e) => ({ ...(e as Json), points: cleanList((e as Json).points) }));
  }
  if (Array.isArray(out.projects)) {
    out.projects = (out.projects as Json[])
      .map((p) => (isPlainObject(p) ? (trimDeep(p) as Json) : p))
      .filter((p) => isPlainObject(p) && p.name)
      .map((p) => (p.points ? { ...(p as Json), points: cleanList((p as Json).points) } : p));
  }
  if (Array.isArray(out.education)) {
    out.education = (out.education as Json[])
      .map((e) => (isPlainObject(e) ? (trimDeep(e) as Json) : e))
      .filter((e) => isPlainObject(e) && e.school);
  }
  if (Array.isArray(out.skills)) {
    out.skills = cleanList(out.skills);
  }
  return out;
}
