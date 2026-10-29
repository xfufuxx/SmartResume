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


def _sidebar_layout_html() -> str:
    """jade-sidebar 系模板的骨架：.wrap(min-height) > .sidebar + .main。"""
    return (
        "<html><head></head><body>"
        "<div class='wrap'>"
        "<div class='sidebar'><div>侧栏技能 Java Spring</div></div>"
        "<div class='main'>"
        "<div>工作经历要点一</div>"
        "<div>项目经历最后一节</div>"
        "</div>"
        "</div>"
        "</body></html>"
    )


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


def test_inject_lands_inside_main_column_not_after_wrapper():
    """核心回归：footer 必须在 .main 内容列内部（跟在最后一个内容块后），
    而不是 min-height:297mm 的 .wrap 容器之后（那会独占一页）。"""
    html = _sidebar_layout_html()
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL}})
    i_footer = out.index('class="qr-footer"')
    # 在最后一个内容块之后、.wrap 容器闭合之前
    assert out.index("项目经历最后一节") < i_footer
    wrap_close = out.rfind("</div>", 0, out.rfind("</body>"))  # .wrap 的闭合
    assert i_footer < wrap_close
    # 不在侧栏里：footer 在侧栏（含其内层 div）闭合之后
    sidebar_open = out.index("<div class='sidebar'>")
    sidebar_inner_close = out.index("</div>", out.index("侧栏技能"))
    sidebar_close = out.index("</div>", sidebar_inner_close + len("</div>"))
    assert i_footer > sidebar_close > sidebar_open


def test_inject_sidebar_with_more_text_still_excluded():
    """侧栏文字量再大也不能成为内容列（class 含 sidebar 直接排除）。"""
    html = (
        "<html><body><div class='wrap'>"
        "<div class='sidebar'><div>" + "侧栏很长很长很长" * 10 + "</div></div>"
        "<div class='main'><div>主内容末尾</div></div>"
        "</div></body></html>"
    )
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL}})
    i_footer = out.index('class="qr-footer"')
    assert out.index("主内容末尾") < i_footer
    assert i_footer < out.rfind("</div>", 0, out.rfind("</body>"))


def test_inject_single_column_template():
    """单栏模板：body > .page > [.header, .sections]，footer 落在 .sections 末尾。"""
    html = (
        "<html><body>"
        "<div class='page'>"
        "<div class='page-header'>姓名 联系方式</div>"
        "<div class='sections'><div>教育</div><div>项目经历末节</div></div>"
        "</div>"
        "</body></html>"
    )
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL}})
    i_footer = out.index('class="qr-footer"')
    assert out.index("项目经历末节") < i_footer
    # footer 在 .sections 内部：早于 .page 外层容器闭合（最后一个 </div>）
    assert i_footer < out.rfind("</div>", 0, out.rfind("</body>"))


def test_inject_never_between_homogeneous_items():
    """同质列表（同标签+同 class 的并列区块）中间不能插 footer——
    必须跟在最后一个区块之后（回归：曾插在第一/二个项目之间）。"""
    html = (
        "<html><body><div class='wrap'>"
        "<div class='sidebar'><div>侧栏技能</div></div>"
        "<div class='main'>"
        "<div class='section'><div class='exp-item'>项目一很长的描述内容</div></div>"
        "<div class='section'><div class='exp-item'>项目二较短的描述</div></div>"
        "</div>"
        "</div></body></html>"
    )
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL}})
    i_footer = out.index('class="qr-footer"')
    i_proj1 = out.index("项目一很长的描述内容")
    i_proj2 = out.index("项目二较短的描述")
    # footer 在两个项目之后，且不在两者之间
    assert i_proj1 < i_proj2 < i_footer
    # footer 在 .main 闭合之前（最后一个 </div> 之前）
    assert i_footer < out.rfind("</div>", 0, out.rfind("</body>"))


def test_inject_malformed_html_falls_back_to_body_close():
    """结构解析不出内容列时退回 </body> 前注入（不阻断、不丢 footer）。"""
    html = "<html><body><div>未闭合的片段"
    out = inject_qr_footer(html, {"qr_code": {"image": _PNG_DATA_URL}})
    assert out.startswith(html)
    assert 'class="qr-footer"' in out
    assert "未闭合的片段" in out


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
