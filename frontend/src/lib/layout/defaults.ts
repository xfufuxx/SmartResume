/**
 * 各 block 类型的默认自由度与尺寸策略 —— 第 1 步设计清单的代码化。
 *
 * 这里只放「按类型静态决定」的参数；默认坐标由 buildLayout.ts 按简历数据量
 * 自上而下流式计算，不放在本文件。
 *
 * 分配逻辑（与第 1 步确认稿一致）：
 * - free（item / avatar / text）：用户最想自由摆放的单元，支持拖成双栏；
 * - horizontal（contact / divider / skill-group）：横贯元素，可左右靠但不破坏垂直阅读流；
 * - vertical（header / summary / section）：保持左对齐列 = 简历可读性底线，垂直挪动制造呼吸感；
 * - locked：预留（页码、水印类系统块）。
 */

import type { BlockSizePolicy, BlockType, DragFreedom } from './types.ts';
import { BLOCK_TYPES, DRAG_FREEDOMS } from './types.ts';

/** 尺寸策略（mm）：能否缩放 / 最小尺寸。冻结防调用方改到共享对象 */
export const DEFAULT_SIZE_POLICY: Readonly<Record<BlockType, BlockSizePolicy>> = Object.freeze({
  header: { resizableW: false, resizableH: true, minW: 60, minH: 10 },
  contact: { resizableW: true, resizableH: false, minW: 60, minH: 10 },
  avatar: { resizableW: true, resizableH: true, minW: 20, minH: 20 },
  divider: { resizableW: true, resizableH: false, minW: 20, minH: 1 },
  summary: { resizableW: false, resizableH: true, minW: 60, minH: 12 },
  section: { resizableW: false, resizableH: false, minW: 60, minH: 6 },
  item: { resizableW: true, resizableH: true, minW: 60, minH: 16 },
  'skill-group': { resizableW: true, resizableH: true, minW: 60, minH: 12 },
  text: { resizableW: true, resizableH: true, minW: 30, minH: 8 },
  // 二维码：图 + 文字同框，等比缩放（图按块高 contain），最小 15mm 保证可扫
  qrcode: { resizableW: true, resizableH: true, minW: 15, minH: 15 },
} as const);

/** 默认拖动自由度 */
export const DEFAULT_FREEDOM: Readonly<Record<BlockType, DragFreedom>> = Object.freeze({
  header: 'vertical',
  contact: 'horizontal',
  avatar: 'free',
  divider: 'horizontal',
  summary: 'vertical',
  section: 'vertical',
  item: 'free',
  'skill-group': 'horizontal',
  text: 'free',
  // 二维码像职业照一样任意摆放（常放页脚右下角）
  qrcode: 'free',
} as const);

export interface BlockTypeDefaults {
  freedom: DragFreedom;
  sizePolicy: BlockSizePolicy;
}

/** 取某类型的默认自由度与尺寸策略（返回表内对象的引用，只读用） */
export function defaultsForType(type: BlockType): BlockTypeDefaults {
  return { freedom: DEFAULT_FREEDOM[type], sizePolicy: DEFAULT_SIZE_POLICY[type] };
}

/** 同上但返回深拷贝——要写入 Block 时用这个，避免多个 block 共享同一 sizePolicy 对象 */
export function defaultsForTypeClone(type: BlockType): BlockTypeDefaults {
  const { freedom, sizePolicy } = defaultsForType(type);
  return { freedom, sizePolicy: { ...sizePolicy } };
}

/** 自检用：两张表都完整覆盖 BLOCK_TYPES 且取值合法。供测试调用 */
export function auditDefaults(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const type of BLOCK_TYPES) {
    const freedom = DEFAULT_FREEDOM[type];
    if (!DRAG_FREEDOMS.includes(freedom)) {
      problems.push(`${type}: illegal freedom "${freedom}"`);
    }
    const sp = DEFAULT_SIZE_POLICY[type];
    if (!sp) {
      problems.push(`${type}: missing sizePolicy`);
      continue;
    }
    if (!(sp.minW > 0) || !(sp.minH > 0)) {
      problems.push(`${type}: non-positive min size ${sp.minW}x${sp.minH}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
