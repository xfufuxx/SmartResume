"""简历底部二维码注入。

设计原则：模板文件零改动——56 套模板逐一加 footer 既不现实也无法保证一致，
与 ``inject_print_css`` 同思路，在 ``render_template_html`` 渲染完成后统一注入。

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

# 页脚高度预算：20mm 图 + 文字，挤不进当页时整体挪到下一页（不许被拦腰切断）
_FOOTER_HTML = (
    '<div class="qr-footer" style="display:flex;align-items:center;'
    "justify-content:center;gap:12px;margin-top:6mm;padding-top:3mm;"
    'page-break-inside:avoid;break-inside:avoid;">'
    '<img src="{src}" alt="二维码" style="width:20mm;height:20mm;display:block;" />'
    '<div style="font-size:9pt;line-height:1.5;color:#444;text-align:left;">{text}</div>'
    "</div>"
)


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
    """把 ``resume_json['qr_code']`` 注入为简历底部页脚；无/不合法则原样返回。

    注入位置 ``</body>`` 之前——模板正文流的最后，打印时自然落在内容末尾；
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

    lowered = html.lower()
    idx = lowered.rfind("</body>")
    if idx == -1:
        return html + footer
    return html[:idx] + footer + html[idx:]
