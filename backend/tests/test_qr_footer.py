"""qr_footer：简历底部二维码注入的单测。"""

import base64

import pytest

from app.services.qr_footer import QrCodeInvalid, inject_qr_footer, sanitize_qr_code

# 1x1 红色 PNG
_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
_PNG_DATA_URL = f"data:image/png;base64,{_PNG_B64}"


def _html_with_body() -> str:
    return "<html><head></head><body><div class='resume'>内容</div></body></html>"


# ── sanitize ──

def test_sanitize_accepts_png_data_url():
    qr = sanitize_qr_code({"image": _PNG_DATA_URL, "label": "Java 后端", "url": "https://github.com/x"})
    assert qr is not None
    assert qr["image"] == _PNG_DATA_URL
    assert qr["label"] == "Java 后端"
    assert qr["url"] == "https://github.com/x"


def test_sanitize_none_or_empty_returns_none():
    assert sanitize_qr_code(None) is None
    assert sanitize_qr_code({}) is None
    assert sanitize_qr_code({"image": ""}) is None
    assert sanitize_qr_code({"image": "   "}) is None


def test_sanitize_rejects_non_data_url():
    with pytest.raises(QrCodeInvalid):
        sanitize_qr_code({"image": "https://evil.example.com/qr.png"})


def test_sanitize_rejects_bad_mime():
    with pytest.raises(QrCodeInvalid):
        sanitize_qr_code({"image": "data:text/html;base64,PGI+"})


def test_sanitize_rejects_oversize_image():
    big = "A" * (500 * 1024)  # base64 解码后 375KB > 300KB 上限
    with pytest.raises(QrCodeInvalid):
        sanitize_qr_code({"image": f"data:image/png;base64,{big}"})


def test_sanitize_trims_and_caps_label():
    qr = sanitize_qr_code({"image": _PNG_DATA_URL, "label": "x" * 100})
    assert len(qr["label"]) == 30


# ── inject ──

def test_inject_appends_footer_before_body_close():
    html = _html_with_body()
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL, "label": "Java 后端"}})
    assert out != html
    assert 'class="qr-footer"' in out
    assert "Java 后端" in out
    assert "扫码查看" in out
    # 注入位置：</body> 之前
    assert out.index('class="qr-footer"') < out.lower().rfind("</body>")
    assert out.lower().endswith("</body></html>")


def test_inject_no_qr_returns_unchanged():
    html = _html_with_body()
    assert inject_qr_footer(html, {}) == html
    assert inject_qr_footer(html, None) == html
    assert inject_qr_footer(html, {"qr_code": None}) == html


def test_inject_invalid_data_warns_not_raises():
    html = _html_with_body()
    # 非法数据不阻断渲染（预览不能挂）
    assert inject_qr_footer(html, {"qr_code": {"image": "not-a-data-url"}}) == html


def test_inject_escapes_label_html():
    out = inject_qr_footer(_html_with_body(), {"qr_code": {"image": _PNG_DATA_URL, "label": "<script>x</script>"}})
    assert "<script>" not in out
    assert "&lt;script&gt;" in out


def test_inject_html_without_body_tag_appends():
    out = inject_qr_footer("<div>片段</div>", {"qr_code": {"image": _PNG_DATA_URL}})
    assert out.startswith("<div>片段</div>")
    assert 'class="qr-footer"' in out
