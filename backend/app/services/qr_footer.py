"""简历底部二维码注入。

设计原则：模板文件零改动——56 套模板逐一加 footer 既不现实也无法保证一致，
与 ``inject_print_css`` 同思路，在 ``render_template_html`` 渲染完成后统一注入。

**注入位置（2026-10-29 修订）**：主内容列的末尾，而不是 ``</body>`` 之前。
原因：所有模板的最外层容器（.page/.wrap）都带 ``min-height: 297mm``，
把 footer 放在容器之后，它永远从下一页开始——用户看到的是
「二维码独占一页」。改为解析渲染后的 DOM 树，把 footer 作为
「主内容列」的最后一个子元素注入，紧跟最后一个内容区块（如项目经历）。

主内容列定位规则（结构启发式，对 56 套模板通用）：
1. 自顶向下走「唯一有内容的子节点」单链（body > .page > .container…）；
2. 侧栏/页眉类节点（aside/nav/header/footer 标签、class 含 sidebar/aside 等）
   直接排除——侧栏文字再多也不能成为注入点；
3. 多个内容子节点**同质**（同标签+同 class，如并列的 .section / .exp-item）
   视为并列内容区块，停在本层——footer 追加在最后一个区块之后，
   绝不插进区块中间；
4. 不同质则下钻到最后一个子节点（内容列在文档流后部，如 .page-header+.sections）。

数据形状（存于 ``resume_json['qr_code']``，即优化记录的 ``optimized_json``）：
    {
        "image": "data:image/png;base64,...",  # 必填；生成或用户上传的二维码图片
        "label": "Java 高级后端",               # 可选；图片旁的文字说明
        "url":   "https://github.com/xxx",     # 可选；二维码指向的链接（打印可读）
    }

安全：image 只接受 data URL（png/jpeg/webp），总解码体积 ≤ 300KB——
二维码本身几十 KB 足够；不接受外链 URL，避免 SSRF 与渲染期网络依赖。
"""

import base64
import html as _html
import re
import logging

logger = logging.getLogger(__name__)

_ALLOWED_MIME = ("image/png", "image/jpeg", "image/webp")
_MAX_IMAGE_BYTES = 300 * 1024  # 解码后字节数上限
_DATA_URL_RE = re.compile(r"^data:(?P<mime>[-\w.]+/[-\w.]+);base64,(?P<b64>[A-Za-z0-9+/=\s]+)$")

# 页脚高度预算：20mm 图 + 文字，挤不进当页时整体挪到下一页（不许被拦腰切断）。
# width:100% + flex-basis 兜底：万一落进横向 flex 容器也独占一行，不会并排成第三列。
_FOOTER_HTML = (
    '<div class="qr-footer" style="width:100%;display:flex;align-items:center;'
    "justify-content:center;gap:12px;margin-top:6mm;padding-top:3mm;"
    'page-break-inside:avoid;break-inside:avoid;">'
    '<img src="{src}" alt="二维码" style="width:20mm;height:20mm;display:block;" />'
    '<div style="font-size:9pt;line-height:1.5;color:#444;text-align:left;">{text}</div>'
    "</div>"
)

# ── 主内容列定位 ──────────────────────────────────────────────

# 参与树解析的容器标签（其余标签视为不透明的文本内容）
_CONTAINER_RE = re.compile(r"<(/?)(div|main|section|article|aside|header|footer|nav)\b[^>]*?(/?)>", re.I)
# 结构性标签：不作为「内容列」候选（侧栏/导航/页眉/页脚）
_CHROME_TAGS = frozenset({"aside", "nav", "header", "footer", "form"})
# class 命中这些词的节点按侧栏处理（jade-sidebar/elegant/fresh/jade-developer… 全系 .sidebar）
_SIDEBAR_CLASS_RE = re.compile(r"sidebar|side-?col|col-?side|aside|left-?col|aside-?col", re.I)
_JINJA_RE = re.compile(r"\{%.*?%\}|\{\{.*?\}\}", re.S)
_TAG_RE = re.compile(r"<[^>]+>")

_MAX_DEPTH = 8


class _Node:
    __slots__ = ("tag", "attrs", "open_end", "close_start", "children")

    def __init__(self, tag: str, attrs: str, open_end: int) -> None:
        self.tag = tag
        self.attrs = attrs
        self.open_end = open_end
        self.close_start: int | None = None
        self.children: list[_Node] = []


def _build_tree(html: str, start: int, end: int) -> list[_Node]:
    """把 [start, end) 内的容器标签解析成森林；未闭合节点不参与（close_start=None）。"""
    roots: list[_Node] = []
    stack: list[_Node] = []
    for m in _CONTAINER_RE.finditer(html, start, end):
        closing, tag, selfclose = m.group(1), m.group(2).lower(), m.group(3)
        if closing:
            if stack:
                stack.pop().close_start = m.start()
            continue
        if selfclose:
            continue
        node = _Node(tag, m.group(0), m.end())
        (stack[-1].children if stack else roots).append(node)
        stack.append(node)
    return roots


def _text_len(html: str, node: _Node) -> int:
    """节点内可见文本长度（剥标签/Jinja，去空白）；未闭合按 0 处理。"""
    if node.close_start is None:
        return 0
    frag = _JINJA_RE.sub(" ", html[node.open_end : node.close_start])
    frag = _TAG_RE.sub(" ", frag)
    return len(re.sub(r"\s+", "", frag))


def _is_chrome(node: _Node) -> bool:
    """侧栏/页眉/页脚类结构节点，不作为内容列候选。"""
    if node.tag in _CHROME_TAGS:
        return True
    m = re.search(r"class=(?:\"([^\"]*)\"|'([^']*)')", node.attrs, re.I)
    cls = m.group(1) or m.group(2) or "" if m else ""
    return bool(cls and _SIDEBAR_CLASS_RE.search(cls))


def _class_of(node: _Node) -> str:
    m = re.search(r"class=(?:\"([^\"]*)\"|'([^']*)')", node.attrs, re.I)
    return (m.group(1) or m.group(2) or "") if m else ""


def _find_content_close(html: str, nodes: list[_Node], fallback: int | None, depth: int) -> int | None:
    """在 nodes（当前容器的子节点列表）里定位内容列的闭合位置。

    返回值 = footer 应插入其前的位置（内容列的 ``</div>`` 起始处）；
    fallback = 本层兜底（当前容器的闭合位置）。

    规则：
    - 唯一内容子节点 → 下钻（body > .page > .container 这类单链）；
    - 多个内容子节点且**同质**（同标签 + 同 class，如 .section/.exp-item 列表）
      → 停在本层：它们是并列的内容区块/列表项，footer 追加在整个列表之后，
        绝不能插进某个区块中间；
    - 多个内容子节点且不同质（如 .sidebar+.main 被排除后剩一个、.page-header+.sections）
      → 下钻到**最后一个**（内容列在后面，footer 跟随内容流）。
    """
    kids = [n for n in nodes if n.close_start is not None and not _is_chrome(n)]
    kids = [n for n in kids if _text_len(html, n) > 0]
    if not kids:
        return fallback
    if len(kids) == 1:
        only = kids[0]
        if depth >= _MAX_DEPTH:
            return only.close_start
        return _find_content_close(html, only.children, only.close_start, depth + 1)
    first = kids[0]
    if all(n.tag == first.tag and _class_of(n) == _class_of(first) for n in kids):
        return fallback  # 同质列表：停在本层，footer 跟在最后一个区块之后
    last = kids[-1]
    if depth >= _MAX_DEPTH:
        return last.close_start
    return _find_content_close(html, last.children, last.close_start, depth + 1)


def _insert_index(html: str) -> int | None:
    """计算 footer 注入位置；返回 None 表示退回 ``</body>`` 前的旧行为。"""
    m = re.search(r"<body[^>]*>", html, re.I)
    end = html.lower().rfind("</body>")
    if end == -1:
        return None
    start = m.end() if m else 0
    roots = _build_tree(html, start, end)
    if not roots:
        return None
    return _find_content_close(html, roots, None, 0)


class QrCodeInvalid(ValueError):
    """二维码数据不合法（400 直接展示给用户）。"""


def sanitize_qr_code(raw: dict | None) -> dict | None:
    """校验并规范化 qr_code 字段；不合法抛 QrCodeInvalid，空/None 返回 None（=移除）。"""
    if not raw or not isinstance(raw, dict):
        return None
    image = (raw.get("image") or "").strip()
    if not image:
        return None

    m = _DATA_URL_RE.match(image)
    if not m:
        raise QrCodeInvalid("二维码图片必须是 data URL（base64 编码的 png/jpeg/webp）")
    mime = m.group("mime").lower()
    if mime not in _ALLOWED_MIME:
        raise QrCodeInvalid(f"不支持的图片格式 {mime}，仅支持 png/jpeg/webp")
    try:
        # base64 库要求去掉空白；正则已允许换行（前端 FileReader 不产生，防御性容忍）
        payload = base64.b64decode(re.sub(r"\s+", "", m.group("b64")), validate=True)
    except Exception as e:
        raise QrCodeInvalid("二维码图片 base64 解码失败") from e
    if len(payload) > _MAX_IMAGE_BYTES:
        raise QrCodeInvalid(f"二维码图片过大（{len(payload) // 1024}KB > 300KB 上限）")

    label = str(raw.get("label") or "").strip()[:30]
    url = str(raw.get("url") or "").strip()[:300]
    cleaned: dict = {"image": image}
    if label:
        cleaned["label"] = label
    if url:
        cleaned["url"] = url
    return cleaned


def inject_qr_footer(html: str, resume_json: dict | None) -> str:
    """把 ``resume_json['qr_code']`` 注入为主内容列末尾的页脚；无/不合法则原样返回。

    注入位置：解析渲染后的 DOM，把 footer 追加到主内容列（.main/.sections 等）
    的末尾——紧跟最后一个内容区块，不落在 ``min-height: 297mm`` 容器撑出的
    空白区，也就不会独占一页。结构解析失败时退回 ``</body>`` 之前的旧行为。
    不合法数据只 warning 不阻断渲染（预览不能因为一个坏图片挂掉）。
    """
    if not resume_json or not isinstance(resume_json, dict):
        return html
    try:
        qr = sanitize_qr_code(resume_json.get("qr_code"))
    except QrCodeInvalid as e:
        logger.warning("[QR页脚] 数据不合法，跳过注入: %s", e)
        return html
    if not qr:
        return html

    lines = []
    if qr.get("label"):
        lines.append(
            f'<div style="font-weight:600;">{_html.escape(qr["label"])}</div>'
        )
    if qr.get("url"):
        lines.append(f"<div>{_html.escape(qr['url'])}</div>")
    lines.append("<div>扫码查看</div>")
    footer = _FOOTER_HTML.format(src=qr["image"], text="".join(lines))

    try:
        idx = _insert_index(html)
    except Exception:  # noqa: BLE001 —— 结构解析任何意外都退回旧行为，不阻断导出
        logger.warning("[QR页脚] 内容列定位失败，退回 </body> 前注入", exc_info=True)
        idx = None
    if idx is None:
        lowered = html.lower()
        body_idx = lowered.rfind("</body>")
        if body_idx == -1:
            return html + footer
        return html[:body_idx] + footer + html[body_idx:]
    return html[:idx] + footer + html[idx:]
