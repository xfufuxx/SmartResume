"""模板一致性 E2E：优化页与优化详情页共用同一模板清单（42 套），选择器形态一致。

覆盖：
1. 优化页「/」模板选择器：42 张卡片、名称正确、选中后面包屑按钮同步
2. 优化详情页「/history/{id}」编辑态：模板按钮 + 卡片选择器（与优化页一致）
3. 详情页选择新模板（海洋之蓝）后重新导出 PDF：后端 200 且为合法 PDF
4. 新模板（学术严谨）后端渲染：PDF 文字含项目要点
5. jadeAI 迁移模板后端渲染：PDF 含内容且文档属性含模板名
6. 选择器新 UI：网格/列表视图切换、分类过滤、标签过滤、搜索、预览弹窗、使用中高亮
7. 模板选择持久化：切模板落库 → 无参重导出仍用该模板 → PDF 文档属性可反查；
   未注册模板 ID 在切换/导出接口显式 400（不再静默回退默认模板）
"""
import os
import re
import sys
import time
import json
import urllib.request
import urllib.error

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"
SHOT_DIR = "D:/下载/智能简历/.workbuddy/tmp"
RECORD_ID = "48ff4b63-4d99-4c1b-b144-210e31ca81d8"
EMAIL = "demo@smart-resume.com"
PASSWORD = "Demo@123456"

EXPECTED = [
    "专业分栏", "简约单栏", "现代渐变", "紧凑高效", "优雅金边", "深色科技",
    "清新绿意", "经典黑白", "海洋之蓝", "暖阳落日", "紫韵流光", "学术严谨",
    # ── jadeAI 迁移（批次 A 共 15 套：下列 13 套 + 上面已有的经典单栏/现代双栏）──
    "经典单栏专业版", "现代双栏创意版",
    "极简留白版", "现代渐变头部版", "时间线版", "浅色侧边栏双栏版", "高管稳重版",
    "专业深蓝版", "创意渐变版", "ATS 友好纯文本版", "学术版", "优雅柔和版",
    "开发者双栏版", "设计师作品集版", "初创活力版",
    # ── jadeAI 迁移（批次 B：行业/职业 5 套）──
    "北欧冷淡版", "企业正式版", "咨询顾问版", "金融投行版", "医疗健康版",
    # ── jadeAI 迁移（批次 C：现代/科技 5 套）──
    "渐变现代版", "磁贴格纹版", "质感卡片版", "代码终端版", "块状网格版",
    # ── jadeAI 迁移（批次 D：创意/艺术 5 套）──
    "杂志排版版", "艺术创想版", "复古雅致版", "霓虹暗夜版", "水彩晕染版",
]

# 模板 ID → 展示名（详情页按钮显示「记录里保存的模板」，不再是硬编码默认值）
TEMPLATE_LABEL = {
    "professional": "专业分栏", "simple": "简约单栏", "modern": "现代渐变",
    "ocean": "海洋之蓝", "sunset": "暖阳落日", "violet": "紫韵流光",
    "academic": "学术严谨", "compact": "紧凑高效", "elegant": "优雅金边",
    "dark": "深色科技", "fresh": "清新绿意", "classic": "经典黑白",
    "jade-classic": "经典单栏专业版", "jade-twocol": "现代双栏创意版",
    "jade-minimal": "极简留白版", "jade-modern": "现代渐变头部版",
    "jade-timeline": "时间线版", "jade-sidebar": "浅色侧边栏双栏版",
    "jade-executive": "高管稳重版", "jade-professional": "专业深蓝版",
    "jade-creative": "创意渐变版", "jade-ats": "ATS 友好纯文本版",
    "jade-academic": "学术版", "jade-elegant": "优雅柔和版",
    "jade-developer": "开发者双栏版", "jade-designer": "设计师作品集版",
    "jade-startup": "初创活力版",
}

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name} | {detail}")


def api(method, path, body=None, token=None, retry=3):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retry):
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retry - 1:
                time.sleep(8)
                continue
            return e.code, e.read()[:400]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ── 登录 ──
    print("[1] 登录")
    page.goto(f"{BASE}/login", wait_until="load", timeout=90000)
    page.wait_for_timeout(3000)
    page.fill('input[placeholder="邮箱地址"]', EMAIL)
    page.fill('input[placeholder="密码"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_function("() => location.pathname.includes('/dashboard')", timeout=60000)

    # ── 优化页模板选择器 ──
    print("[2] 优化页模板选择器")
    page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=AI 优化后简历", timeout=60000)
    page.wait_for_timeout(600)

    tpl_btn = page.locator("button:has-text('专业分栏')").first
    check("优化页-默认模板按钮", tpl_btn.count() == 1)
    tpl_btn.click()
    page.wait_for_selector("text=选择简历模板风格", timeout=15000)
    page.wait_for_timeout(500)

    modal_cards = page.locator(".ant-modal-body .ant-card")
    n = modal_cards.count()
    check("优化页-卡片数量=42", n == 42, f"got {n}")
    labels = [re.sub(r"\s+", "", modal_cards.nth(i).inner_text()) for i in range(n)]
    # labels 已去掉全部空白，EXPECTED 侧必须同样归一化，否则含空格的名称
    # （如「ATS 友好纯文本版」）永远匹配不上
    missing = [e for e in EXPECTED if not any(re.sub(r"\s+", "", e) in l for l in labels)]
    check("优化页-42 模板名称齐全", not missing, f"missing={missing}")
    jade_cards = [l for l in labels if "jadeAI" in l or "高保真" in l]
    check("优化页-jadeAI 迁移模板带高保真标记", len(jade_cards) >= 2, f"got {jade_cards}")
    check("优化页-默认模板带使用中高亮", "当前使用中" in labels[0], labels[0])
    page.screenshot(path=f"{SHOT_DIR}/tpl_01_optimize_selector.png", full_page=False)

    # ── 新 UI：视图切换 / 分类 / 标签 / 搜索 / 预览弹窗 ──
    print("[2.5] 选择器新 UI（视图/过滤/搜索/预览）")

    # 列表视图
    page.locator(".ant-segmented-item", has_text="列表").first.click()
    page.wait_for_timeout(400)
    list_cards = page.locator(".ant-modal-body .ant-card")
    check("UI-列表视图仍为 42 张", list_cards.count() == 42, f"got {list_cards.count()}")
    page.locator(".ant-segmented-item", has_text="网格").first.click()
    page.wait_for_timeout(400)
    check("UI-切回网格视图", modal_cards.count() == 42)

    # 分类过滤：商务通用 = professional + ocean + elegant + jade-classic
    #           + jade-modern/professional/executive/timeline/sidebar/elegant/startup = 11
    #           + 批次 B 的 corporate/consultant/finance = 14
    page.locator(".ant-tabs-tab", has_text="商务通用").first.click()
    page.wait_for_timeout(400)
    biz = modal_cards.count()
    check("UI-分类过滤(商务通用)=14", biz == 14, f"got {biz}")
    biz_labels = [re.sub(r"\s+", "", modal_cards.nth(i).inner_text()) for i in range(biz)]
    check("UI-分类过滤含 jade 经典单栏", any("经典单栏专业版" in l for l in biz_labels), str(biz_labels))
    page.locator(".ant-tabs-tab", has_text="全部").first.click()
    page.wait_for_timeout(400)
    check("UI-切回全部恢复 42", modal_cards.count() == 42)

    # 标签过滤：双栏 = professional + violet + elegant + jade-twocol + jade-sidebar + jade-developer = 6
    page.locator(".ant-tag-checkable", has_text="#双栏").first.click()
    page.wait_for_timeout(400)
    dual = modal_cards.count()
    check("UI-标签过滤(#双栏)=6", dual == 6, f"got {dual}")
    page.locator(".ant-tag-checkable", has_text="#双栏").first.click()
    page.wait_for_timeout(400)

    # 搜索
    page.fill('input[placeholder*="搜索模板"]', "海洋")
    page.wait_for_timeout(400)
    sr = modal_cards.count()
    check("UI-搜索(海洋)=1", sr == 1, f"got {sr}")
    page.fill('input[placeholder*="搜索模板"]', "不存在的模板xyz")
    page.wait_for_timeout(400)
    check("UI-搜索无结果显示空态", modal_cards.count() == 0 and page.locator(".ant-empty").count() > 0)
    page.fill('input[placeholder*="搜索模板"]', "")
    page.wait_for_timeout(400)
    check("UI-清空搜索恢复 42", modal_cards.count() == 42)

    # 预览弹窗（眼睛图标，不触发选中）
    page.locator('.ant-modal-body .anticon-eye[title="预览"]').first.click()
    page.wait_for_timeout(600)
    preview_open = page.locator(".ant-modal-wrap:visible").count() > 0
    check("UI-预览弹窗打开", preview_open)
    has_tabs = page.locator(".ant-modal-body .ant-tabs-tab", has_text="示意图").count() > 0
    check("UI-预览弹窗含示意图/真实排版页签", has_tabs)
    # 真实排版 iframe（后端预览端点经 Next rewrites 代理）
    page.locator(".ant-modal-body .ant-tabs-tab", has_text="真实排版").first.click()
    page.wait_for_timeout(2500)
    iframe_ok = False
    for frame in page.frames:
        if "/api/templates/" in (frame.url or ""):
            try:
                body_txt = frame.locator("body").inner_text(timeout=8000)
                iframe_ok = "陈思远" in body_txt
            except Exception:
                pass
            break
    check("UI-真实排版 iframe 渲染演示数据", iframe_ok)
    # 从预览弹窗直接使用模板（两个弹窗都会关闭）
    page.locator(".ant-modal-wrap:visible button:has-text('使用此模板')").first.click()
    page.wait_for_timeout(800)
    gone = False
    for _ in range(20):
        page.wait_for_timeout(200)
        if page.locator(".ant-modal-wrap:visible").count() == 0:
            gone = True
            break
    check("UI-使用此模板后弹窗全部关闭", gone)
    page.screenshot(path=f"{SHOT_DIR}/tpl_01b_preview_modal.png", full_page=False)

    # 重新打开主选择器，选中「紫韵流光」→ 弹窗关闭 + 按钮文案同步
    page.locator("button:has-text('专业分栏')").first.click()
    page.wait_for_selector("text=选择简历模板风格", timeout=15000)
    page.wait_for_timeout(500)
    page.locator(".ant-modal-body .ant-card", has_text="紫韵流光").first.click()
    modal_gone = False
    for _ in range(30):
        page.wait_for_timeout(200)
        # antd Modal 关闭后 DOM 残留（display:none），须按可见性判断
        if page.locator(".ant-modal-wrap:visible").count() == 0:
            modal_gone = True
            break
    check("优化页-弹窗已关闭", modal_gone)
    btn_text = re.sub(r"\s+", "", page.locator("button", has_text="紫韵流光").first.inner_text())
    check("优化页-按钮同步为紫韵流光", "紫韵流光" in btn_text, btn_text)

    # ── 详情页模板选择器 ──
    print("[3] 优化详情页模板选择器")
    # 详情页按钮显示「记录中保存的模板」，先取记录当前值作为断言基准
    st, rec = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    _tk = json.loads(rec)["access_token"] if st == 200 else None
    st, rec = api("GET", f"/api/optimize/{RECORD_ID}", token=_tk)
    saved_tpl = (json.loads(rec) if st == 200 else {}).get("template") or "professional"
    expect_label = TEMPLATE_LABEL.get(saved_tpl, "专业分栏")
    page.goto(f"{BASE}/history/{RECORD_ID}", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("text=简历内容对比", timeout=60000)
    page.wait_for_timeout(500)
    page.click("button:has-text('编辑内容')")
    page.wait_for_selector("text=编辑优化结果", timeout=15000)
    page.wait_for_timeout(400)

    d_btn = page.locator("button", has_text=expect_label).first
    check("详情页-按钮显示记录保存的模板", d_btn.count() == 1, f"expect={expect_label}")
    if d_btn.count() == 0:
        page.screenshot(path=f"{SHOT_DIR}/tpl_02a_detail_btn_missing.png", full_page=False)
    d_btn.click()
    page.wait_for_selector("text=选择简历模板风格", timeout=15000)
    page.wait_for_timeout(500)
    d_cards = page.locator(".ant-modal-body .ant-card")
    dn = d_cards.count()
    check("详情页-卡片数量=42", dn == 42, f"got {dn}")
    d_labels = [re.sub(r"\s+", "", d_cards.nth(i).inner_text()) for i in range(dn)]
    d_missing = [e for e in EXPECTED if not any(re.sub(r"\s+", "", e) in l for l in d_labels)]
    check("详情页-42 模板名称齐全", not d_missing, f"missing={d_missing}")
    # 「当前使用中」徽标随两页各自选中项变化，比较顺序前先剔除徽标文本
    norm = lambda xs: [x.replace("当前使用中", "") for x in xs]
    check("两处选择器顺序完全一致", norm(labels) == norm(d_labels))
    page.screenshot(path=f"{SHOT_DIR}/tpl_02_detail_selector.png", full_page=False)

    # 选中「海洋之蓝」
    page.locator(".ant-modal-body .ant-card", has_text="海洋之蓝").first.click()
    page.wait_for_timeout(600)
    d_btn2 = page.locator("button", has_text="海洋之蓝").first
    check("详情页-按钮同步为海洋之蓝", d_btn2.count() == 1)

    # ── 重新导出 PDF ──
    print("[4] 重新导出 PDF（海洋之蓝）")
    page.click("button:has-text('重新导出 PDF')")
    ok_export = False
    for _ in range(40):
        page.wait_for_timeout(1000)
        if page.locator(".ant-message").count() > 0:
            msg = page.locator(".ant-message").inner_text()
            if "成功" in msg or "已按最新内容" in msg:
                ok_export = True
                break
        if "已按最新内容重新生成" in page.content():
            ok_export = True
            break
    check("详情页-重新导出成功提示", ok_export)

    # API 层验证：该记录 pdf_url 可下载且为合法 PDF
    st, body = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = json.loads(body)["access_token"] if st == 200 else None
    st, rec = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
    rec_json = json.loads(rec)
    pdf_url = (rec_json.get("data") or rec_json).get("pdf_url") if st == 200 else None
    check("详情页-记录返回 pdf_url", bool(pdf_url), str(rec)[:120])
    if pdf_url:
        dl = pdf_url if pdf_url.startswith("http") else API + pdf_url
        req = urllib.request.Request(dl)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=90) as r:
                pdf = r.read()
            check("详情页-PDF 可下载且合法", pdf[:4] == b"%PDF" and len(pdf) > 5000, f"size={len(pdf)}")
        except Exception as e:
            check("详情页-PDF 可下载且合法", False, str(e)[:150])

    page.screenshot(path=f"{SHOT_DIR}/tpl_03_detail_after_export.png", full_page=False)

    # ── 后端新模板渲染（academic）──
    print("[5] 后端 academic 模板渲染")
    st, pdf = api("POST", "/api/optimize/test-template?template=academic", {
        "resume_data": {
            "personal_info": {"name": "模板验证"},
            "summary": "验证摘要",
            "experience": [{"title": "工程师", "company": "A", "start": "2020", "end": "2022", "points": ["负责核心系统开发UNIQUEACADEMIC。"]}],
            "education": [{"school": "S", "degree": "本科", "major": "CS", "start": "2016", "end": "2020"}],
            "skills": ["Python"],
            "projects": [{"name": "全域直流管控平台", "role": "后端负责人", "start": "2022.03", "end": "2023.08",
                          "points": ["主导后端架构设计UNIQUEACADEMIC。"]}],
        }
    }, token=token)
    check("后端-academic 模板 200 且 PDF", st == 200 and pdf[:4] == b"%PDF", f"st={st} size={len(pdf)}")

    # ── jadeAI 迁移模板渲染 + PDF 文档属性 ──
    print("[5.5] jadeAI 迁移模板渲染 + PDF 文档属性")
    try:
        import fitz
        # 批次 A 全量 15 套：marker 必须出现在 PDF 文本层，证明导出确由该模板渲染器产出
        # （而不是静默回退到默认模板）——这是「预览 = 导出」最硬的一条断言
        for tpl, marker in (
            ("jade-classic", "UNIQUEJADECLS"), ("jade-twocol", "UNIQUEJADETWO"),
            ("jade-minimal", "UQJMIN"), ("jade-modern", "UQJMOD"),
            ("jade-timeline", "UQJTL"), ("jade-sidebar", "UQJSB"),
            ("jade-executive", "UQJEXEC"), ("jade-professional", "UQJPROF"),
            ("jade-creative", "UQJCRE"), ("jade-ats", "UQJATS"),
            ("jade-academic", "UQJACA"), ("jade-elegant", "UQJELE"),
            ("jade-developer", "UQJDEV"), ("jade-designer", "UQJDES"),
            ("jade-startup", "UQJSTU"),
            # ── 批次 B：行业/职业 5 套 ──
            ("jade-nordic", "UQJNOR"), ("jade-corporate", "UQJCORP"),
            ("jade-consultant", "UQJCONS"), ("jade-finance", "UQJFIN"),
            ("jade-medical", "UQJMED"),
            # ── 批次 C：现代/科技 5 套 ──
            ("jade-gradient", "UQJGRAD"), ("jade-metro", "UQJMETRO"),
            ("jade-material", "UQJMAT"), ("jade-coder", "UQJCODE"),
            ("jade-blocks", "UQJBLK"),
            # ── 批次 D：创意/艺术 5 套 ──
            ("jade-magazine", "UQJMAG"), ("jade-artistic", "UQJART"),
            ("jade-retro", "UQJRET"), ("jade-neon", "UQJNEO"),
            ("jade-watercolor", "UQJWAT"),
        ):
            # test-template 限 10 次/分钟：30 套必然跨多次限流窗口。
            # 命中 429 必须等满一个窗口再重试——否则拿到的是 84 字节 JSON，
            # 传给 PyMuPDF 会抛 FileDataError（曾误判成模板渲染失败）。
            # retry=1 避免 api() 内部再 sleep 8 白等。
            st, pdf = 429, b""
            for _attempt in range(5):
                st, pdf = api("POST", f"/api/optimize/test-template?template={tpl}", {
                    "resume_data": {
                        "personal_info": {"name": "模板验证"},
                        "summary": "验证摘要",
                        "experience": [{"title": "工程师", "company": "A", "start": "2020", "end": "2022",
                                        "points": [f"负责核心系统开发{marker}。"]}],
                        "education": [{"school": "S", "degree": "本科", "major": "CS", "start": "2016", "end": "2020"}],
                        "skills": ["Python"],
                        "projects": [{"name": "验证平台", "role": "负责人", "start": "2022.03", "end": "2023.08",
                                      "points": [f"主导架构{marker}。"]}],
                    }
                }, token=token, retry=1)
                if st != 429:
                    break
                time.sleep(62)
            doc = fitz.open(stream=pdf, filetype="pdf")
            md = doc.metadata
            text = "".join(pg.get_text() for pg in doc)
            doc.close()
            good = (
                st == 200 and pdf[:4] == b"%PDF" and len(pdf) > 3000
                and marker in text
                and md["title"].endswith("简历")
                and md["creationDate"].startswith("D:")
                and bool(md["author"])
            )
            check(f"后端-{tpl} 渲染+文档属性", good,
                  f"st={st} size={len(pdf)} title={md['title']!r} author={md['author']!r} text_ok={marker in text}")
    except ImportError:
        check("后端-jade 模板渲染+文档属性", False, "PyMuPDF 不可用")

    # ── [6] 模板选择持久化（P0：模板 ID 落库，导出读记录，非法值显式失败）──
    print("[6] 模板选择持久化")
    st, rec = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
    rec_json = json.loads(rec) if st == 200 else {}
    check("记录含 template 字段", "template" in rec_json, f"keys={list(rec_json)[:8]}")
    backup_template = rec_json.get("template") or "professional"

    st, body = api("PUT", f"/api/optimize/{RECORD_ID}/template", {"template": "jade-classic"}, token=token)
    check("切模板 200 且回显 jade-classic",
          st == 200 and json.loads(body).get("template") == "jade-classic", f"st={st} {body[:120]}")

    st, body = api("GET", f"/api/optimize/{RECORD_ID}", token=token)
    check("重新 GET 仍为 jade-classic（已落库）",
          json.loads(body).get("template") == "jade-classic", f"got {json.loads(body).get('template')!r}")

    st, body = api("PUT", f"/api/optimize/{RECORD_ID}/template", {"template": "not-a-template"}, token=token)
    check("切到未注册模板 400", st == 400, f"st={st} {body[:100]}")

    st, body = api("POST", f"/api/optimize/{RECORD_ID}/reexport?template=not-a-template", token=token)
    check("重导出显式传非法模板 400", st == 400, f"st={st} {body[:100]}")

    # 不带 template 参数 → 必须用记录里的模板，且 PDF 文档属性可反查
    st, body = api("POST", f"/api/optimize/{RECORD_ID}/reexport", token=token)
    payload = json.loads(body) if st == 200 else {}
    check("重导出无参 200", st == 200, f"st={st} {body[:120]}")
    check("重导出无参使用记录模板", payload.get("template") == "jade-classic", f"got {payload.get('template')!r}")

    pdf_url = payload.get("pdf_url")
    if pdf_url:
        try:
            dl = pdf_url.replace("http://localhost:8000", API)
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                urllib.request.Request(dl), timeout=90
            ) as r:
                exported = r.read()
            import fitz as _fitz
            doc = _fitz.open(stream=exported, filetype="pdf")
            md = doc.metadata
            doc.close()
            check("导出 PDF 文档属性可反查模板",
                  "template-id=jade-classic" in (md.get("keywords") or ""),
                  f"keywords={md.get('keywords')!r}")
        except Exception as e:
            check("导出 PDF 文档属性可反查模板", False, str(e)[:150])

    # 清理：恢复原模板并重导出，避免污染演示数据
    api("PUT", f"/api/optimize/{RECORD_ID}/template", {"template": backup_template}, token=token)
    st, body = api("POST", f"/api/optimize/{RECORD_ID}/reexport", token=token)
    check("清理：恢复原模板并重导出", st == 200 and json.loads(body).get("template") == backup_template,
          f"st={st} expect={backup_template}")

    # ── JS 未捕获异常 ──
    js_errors = [e for e in errors if "favicon" not in e.lower()]
    check("无未捕获 JS 异常", len(js_errors) == 0, "; ".join(js_errors[:3]))

    browser.close()

print(f"\n===== {passed}/{passed + failed} 通过 =====")
sys.exit(0 if failed == 0 else 1)
