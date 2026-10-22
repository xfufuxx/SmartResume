/**
 * 可视化排版编辑器 —— 类型与常量（唯一事实来源）
 *
 * 单位约定：
 * - 所有坐标 / 尺寸单位是 mm（A4 画布 210×297），存储保留 2 位小数；
 * - DOM 像素只在交互瞬间存在，由 geometry.ts 负责换算，绝不出现在存储里；
 * - 预览用 CSS mm（96dpi 参考像素），导出用 Playwright A4（72dpi pt），两端天然 1:1。
 */

/** 布局文档版本号。结构不兼容变更时 +1，并在 serialize.ts 的 MIGRATIONS 注册迁移函数 */
export const LAYOUT_VERSION = 1;

/** A4 画布物理尺寸（mm） */
export const CANVAS_MM = { width: 210, height: 297 } as const;

/** 默认模板 id（旧文档无 template 字段时的兜底）。模板注册表在 templates.ts */
export const DEFAULT_TEMPLATE_ID = 'classic';

/** 安全边距（mm）：内容硬约束，越界由 clampRect 拉回、由 validateLayout 报错 */
export const SAFE_MARGIN_MM = 15;

/** 对齐吸附阈值：100% 缩放下的视觉像素 */
export const SNAP_THRESHOLD_PX = 6;

/** block 类型全集。渲染方式（BlockContent）与默认参数（defaults.ts）都按它分流 */
export const BLOCK_TYPES = [
  'header',
  'contact',
  'avatar',
  'divider',
  'summary',
  'section',
  'item',
  'skill-group',
  'text',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** 拖动自由度全集 */
export const DRAG_FREEDOMS = ['free', 'horizontal', 'vertical', 'locked'] as const;
export type DragFreedom = (typeof DRAG_FREEDOMS)[number];

/** block 位置与尺寸：mm，相对画布左上角。这是唯一真相，DOM px 不入库 */
export interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 尺寸策略：能否缩放 / 最小尺寸（mm） */
export interface BlockSizePolicy {
  resizableW: boolean;
  resizableH: boolean;
  minW: number;
  minH: number;
}

/**
 * 内容引用：指向 optimized_json 的路径 + 渲染快照。
 * payload 是构建布局时冻结的数据，预览与导出都以它为准，
 * 避免用户之后又去改内容导致预览/导出不一致。
 */
export interface BlockContentRef {
  /** 数据路径，如 'personal_info.name' / 'experience[0].points' */
  source: string;
  payload?: unknown;
}

/** 可覆盖的内联样式（pt / 十六进制色） */
export interface BlockStyle {
  fontSizePt?: number;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export interface Block {
  /** 稳定 id：blk_header / blk_exp_0，同简历内唯一，重新生成默认布局时幂等 */
  id: string;
  type: BlockType;
  /**
   * 所在页（0 基）。rect.y 是**页内相对**坐标（0 ~ canvas.height），
   * 单页文档缺省为 0——旧存档无需迁移，本就可当单页读。
   */
  page?: number;
  rect: BlockRect;
  /** 声明的拖动自由度 */
  freedom: DragFreedom;
  sizePolicy: BlockSizePolicy;
  contentRef: BlockContentRef;
  style?: BlockStyle;
  /** 运行时覆盖：锁定后 freedom 失效 */
  locked?: boolean;
  /** 隐藏则导出跳过 */
  visible?: boolean;
}

/** 完整布局文档：存入简历记录、带版本号便于迁移 */
export interface LayoutDocument {
  version: number;
  /** mm，恒为 A4 */
  canvas: { width: number; height: number };
  /**
   * 默认块间距（mm）——移动端排序重排 y 时的间距基准。
   * buildLayout 写入实际使用的值（fit 兜底压缩后为压缩值）；
   * 旧文档（v1 早期）缺省，读取方兜底 DEFAULT_GAP_MM。
   */
  gap?: number;
  /**
   * 总页数（≥1）。缺省或小于「最大 block.page + 1」时，读取方兜底补齐
   * （见 paging.ts 的 pageCountOf）。多页简历的页序 = 0..pageCount-1。
   */
  pageCount?: number;
  /**
   * 当前模板 id（templates.ts 注册表）。缺省兜底 'classic'——
   * 旧存档无此字段，按经典单栏读。切换模板时由 applyTemplate 重写。
   */
  template?: string;
  /** 数组顺序 = 层级，后者在上 */
  blocks: Block[];
  /** 视图偏好，不参与导出 */
  view?: {
    zoom: number;
    gridSnap: boolean;
    alignAssist: boolean;
  };
  /** ISO 时间戳 */
  updatedAt?: string;
}
