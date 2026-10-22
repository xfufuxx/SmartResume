"""
模板库 API：列表（元数据下发）+ 单模板 HTML 预览。

与前端 TemplateRegistry（frontend/src/lib/template-registry.tsx）字段对齐：
元数据的单一事实源在 app/services/template_meta.py，两边靠 key 关联。

- GET /api/templates              全量模板元数据（分类/行业/标签/主题色/版本）
- GET /api/templates/demo         预览专用演示数据（单一事实源，前端静态副本由快测守护）
- GET /api/templates/{key}/preview  用演示数据渲染模板 HTML（供 iframe 高保真预览）

缓存策略（问题 10）：
- 预览响应完全由（模板文件 + 演示数据 + 主题参数）决定 → 以「模板 mtime +
  模板 version + 演示数据指纹 + 主题参数 + 渲染链 mtime」构造强 ETag，
  命中 If-None-Match 返回 304，并允许浏览器私有缓存 max-age=300；
- 列表端点元数据随版本发布、变化极低 → 强 ETag + max-age=3600。
模板文件一改（mtime 变）或渲染链代码一更新，ETag 即自然失效，不会 serving 旧版。
"""

import hashlib
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.services.pdf_generator import TEMPLATE_DIR, render_template_html
from app.services.template_meta import TEMPLATE_META, get_template_meta

logger = logging.getLogger(__name__)

router = APIRouter()

# ── 预览专用演示数据（与前端 lib/template-demo-data.ts 同构） ──
_DEMO_RESUME = {
    "personal_info": {
        "name": "陈思远",
        "email": "chensiyuan@example.com",
        "phone": "138-0000-0000",
    },
    "summary": (
        "5 年互联网产品设计经验，主导过日活百万级 C 端产品的完整设计周期。"
        "擅长用户研究、交互设计与设计系统建设，具备良好的跨职能协作能力，"
        "能独立推动从需求洞察到落地验证的闭环。"
    ),
    "experience": [
        {
            "company": "某知名互联网公司",
            "title": "高级产品设计师",
            "start": "2022.03",
            "end": "至今",
            "points": [
                "主导核心购物流路的体验改版，转化率提升 23%，NPS 提升 11 分",
                "从 0 到 1 搭建组件化设计系统，覆盖 12 条业务线，设计交付效率提升 40%",
                "建立用户可用性测试流程，累计完成 30+ 轮测试，输出报告被产品委员会采纳",
            ],
        },
        {
            "company": "某成长型 SaaS 企业",
            "title": "产品设计师",
            "start": "2019.07",
            "end": "2022.02",
            "points": [
                "负责 B 端工作台的整体信息架构重构，任务完成路径缩短 35%",
                "推动设计走查机制落地，线上视觉还原度从 82% 提升至 97%",
            ],
        },
    ],
    "education": [
        {"school": "某 985 高校", "degree": "硕士", "major": "设计学", "start": "2016.09", "end": "2019.06"},
        {"school": "某 211 高校", "degree": "学士", "major": "工业设计", "start": "2012.09", "end": "2016.06"},
    ],
    "skills": ["用户研究", "交互设计", "设计系统", "Figma", "数据驱动", "可用性测试", "前端基础"],
    "projects": [
        {
            "name": "电商大促活动阵地改版",
            "role": "设计负责人",
            "start": "2023.05",
            "end": "2023.11",
            "points": [
                "统筹 6 人设计团队完成双 11 阵地设计，活动页 GMV 同比增长 31%",
                "设计并落地动态皮肤能力，支持运营零代码配置，节省 80% 重复开发",
            ],
        },
        {
            "name": "企业级设计系统 DesignKit",
            "role": "核心贡献者",
            "start": "2022.06",
            "end": "2023.03",
            "points": ["制定 Token 规范与深色模式方案，组件复用率达到 76%"],
        },
    ],
}


# ── 缓存基元（问题 10） ──
# 演示数据指纹：import 时算一次；改 _DEMO_RESUME 即自动换指纹（缓存自然失效）
_DEMO_FINGERPRINT = hashlib.sha256(
    json.dumps(_DEMO_RESUME, sort_keys=True, ensure_ascii=False).encode("utf-8")
).hexdigest()[:16]

# 渲染链代码文件：打印基座 / 主题归一化 / 渲染收口自身的改动也要体现在 ETag 上
# （否则改完 print_css.py，用户浏览器里 5 分钟内的旧预览仍是旧规则）
_RENDER_CHAIN_FILES = (
    os.path.join(os.path.dirname(__file__), "..", "services", "pdf_generator.py"),
    os.path.join(os.path.dirname(__file__), "..", "services", "print_css.py"),
    os.path.join(os.path.dirname(__file__), "..", "services", "resume_theme.py"),
)


def _mtime_ns(path: str) -> int:
    """文件 mtime（纳秒）；缺失返回 0。"""
    try:
        return os.stat(path).st_mtime_ns
    except OSError:
        return 0


def _build_preview_etag(meta, theme_config: dict) -> str:
    """预览响应的强 ETag：模板内容 + 版本 + 演示数据 + 主题参数 + 渲染链。"""
    raw = "|".join([
        meta.id,
        str(meta.version),
        str(_mtime_ns(os.path.join(TEMPLATE_DIR, f"{meta.id}.html"))),
        _DEMO_FINGERPRINT,
        json.dumps(theme_config, sort_keys=True, ensure_ascii=False),
        *(str(_mtime_ns(p)) for p in _RENDER_CHAIN_FILES),
    ])
    return '"tpl-' + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20] + '"'


def _etag_matches(if_none_match: str | None, etag: str) -> bool:
    """按 RFC 7232 解析 If-None-Match（支持列表、*、W/ 弱校验形式）。"""
    if not if_none_match:
        return False
    for candidate in if_none_match.split(","):
        c = candidate.strip()
        if c == "*":
            return True
        if c.startswith("W/"):
            c = c[2:].strip()
        if c == etag:
            return True
    return False


@router.get("")
async def list_templates(request: Request):
    """全量模板元数据（前端选择面板的数据源）。"""
    items = [
        {
            "id": t.id,
            "name": t.name,
            "author": t.author,
            "version": t.version,
            "category": t.category,
            "industries": list(t.industries),
            "tags": list(t.tags),
            "theme": t.theme,
            "layoutFeatures": t.layout_features.to_dict(),
            "desc": t.desc,
            "preview_url": f"/api/templates/{t.id}/preview",
        }
        for t in TEMPLATE_META.values()
    ]
    payload = {"total": len(items), "items": items}

    # 元数据随版本发布、变化极低：强 ETag（内容哈希）+ 1 小时私有缓存
    etag = '"tpl-list-' + hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:20] + '"'
    headers = {"ETag": etag, "Cache-Control": "private, max-age=3600"}
    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return JSONResponse(content=payload, headers=headers)


@router.get("/demo")
async def demo_resume():
    """模板预览专用演示数据（单一事实源）。

    前端 `lib/template-demo-data.ts` 是同一数据的静态副本（React 组件预览需要
    同步导入，不走网络），两份之间由 `scripts/check_template_sync.py` 的
    「演示数据一致性」断言守护——改这里必须同步改前端，否则提交被拦。
    """
    return _DEMO_RESUME


@router.get("/{template_id}/preview", response_class=HTMLResponse)
async def preview_template(
    request: Request,
    template_id: str,
    primary: str | None = Query(None, description="主题主色 #RRGGBB（可选，实时预览用）"),
    accent: str | None = Query(None, description="主题辅色 #RRGGBB（可选）"),
    font_family: str | None = Query(None, description="字体（白名单，可选）"),
    base_font_size: float | None = Query(None, description="正文字号 pt（可选）"),
    line_height: float | None = Query(None, description="行距（可选）"),
    section_gap: float | None = Query(None, description="章节间距 mm（可选）"),
):
    """用演示数据渲染指定模板，返回完整 HTML（iframe src 直接引用）。

    主题参数全部可选：与 PDF 导出走同一条渲染链（render_template_html +
    resume_theme.normalize_theme_config），保证「预览所见 = 导出所得」。
    """
    from app.services.resume_theme import normalize_theme_config

    meta = get_template_meta(template_id)
    if not meta:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")

    theme_config: dict = {}
    if primary:
        theme_config["primary"] = primary
    if accent:
        theme_config["accent"] = accent
    if font_family:
        theme_config["fontFamily"] = font_family
    if base_font_size is not None:
        theme_config["baseFontSizePt"] = base_font_size
    if line_height is not None:
        theme_config["lineHeight"] = line_height
    if section_gap is not None:
        theme_config["sectionGapMm"] = section_gap

    # 主题参数 strict 校验先于缓存校验：非法值明确 400，不会被 304 吞掉
    # （合法参数的 URL 与 ETag 一一对应，客户端只可能对自己拿到过 200 的 URL 发 304）
    if theme_config:
        try:
            normalize_theme_config(
                theme_config,
                template_id=meta.id,
                text_defaults=meta.text_defaults,
                page_margin_mm=meta.layout_features.page_margin_y_mm,
                strict=True,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    etag = _build_preview_etag(meta, theme_config)
    headers = {
        "ETag": etag,
        # iframe 预览：允许浏览器私有缓存 5 分钟（模板/演示数据/渲染链/主题参数
        # 任一变化 → ETag 变 → 自动重新验证；历史上的 no-store 已无必要）
        "Cache-Control": "private, max-age=300",
    }
    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)

    template_file = f"{meta.id}.html"
    try:
        # 与 PDF 导出同一条渲染链：模板私有样式 + 打印基座（@page / 分页保护）+ 主题变量。
        # （主题参数已在上面 strict 校验；渲染内部的 normalize 以模板默认为基线做合并）
        html = render_template_html(template_file, _DEMO_RESUME, theme_config=theme_config or None)
    except ValueError as e:
        # 渲染链内的主题归一化异常同样明确 400（与上面的校验保持一致）
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"[模板预览] 模板文件加载失败 {template_file}: {e}")
        raise HTTPException(status_code=500, detail="模板文件加载失败")

    return HTMLResponse(content=html, headers=headers)
