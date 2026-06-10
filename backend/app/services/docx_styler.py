"""
DOCX 样式保留与文本替换服务。

核心能力：
1. 解析 DOCX 文档结构，提取段落/表格及其样式
2. 按「信息区块」（如工作经历、教育背景、技能等）分组
3. 将 AI 优化后的文本回填到原文档，保留全部样式
4. 将 DOCX 转换为 PDF
"""

import os
import copy
import uuid
import logging
from io import BytesIO
from dataclasses import dataclass, field
from typing import Optional

from docx import Document
from docx.shared import Pt, Inches, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

logger = logging.getLogger(__name__)

# ─── 数据结构 ───────────────────────────────────────────────────


@dataclass
class RunInfo:
    """单个 run 的样式信息"""
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    font_name: str = ""
    font_size: Optional[float] = None
    color: Optional[str] = None  # RGB hex


@dataclass
class ParagraphInfo:
    """段落的完整信息：文本 + 样式 + 在文档中的索引"""
    text: str
    runs: list[RunInfo] = field(default_factory=list)
    alignment: Optional[str] = None
    style_name: str = ""
    is_heading: bool = False
    heading_level: int = 0
    paragraph_index: int = 0  # 在原文档 body 中的序号


@dataclass
class Section:
    """简历中的一个信息区块"""
    type: str  # "heading", "summary", "experience", "education", "skills", "projects"
    title: str = ""
    paragraphs: list[ParagraphInfo] = field(default_factory=list)
    paragraph_indices: list[int] = field(default_factory=list)


# ─── 段落提取 ───────────────────────────────────────────────────


def _safe_get_paragraph_props(para) -> dict:
    """安全获取段落属性"""
    info = {
        "alignment": None,
        "style_name": para.style.name if para.style else "",
        "is_heading": False,
        "heading_level": 0,
    }
    if para.style and para.style.name and "Heading" in para.style.name:
        info["is_heading"] = True
        try:
            info["heading_level"] = int(para.style.name.replace("Heading", "").strip())
        except ValueError:
            info["heading_level"] = 1
    return info


def _get_alignment_str(para) -> Optional[str]:
    """获取段落对齐方式字符串"""
    mapping = {
        WD_ALIGN_PARAGRAPH.LEFT: "left",
        WD_ALIGN_PARAGRAPH.CENTER: "center",
        WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify",
    }
    return mapping.get(para.alignment)


def _get_run_info(run) -> RunInfo:
    """提取单个 run 的样式信息"""
    info = RunInfo(text=run.text)
    if run.bold is not None:
        info.bold = run.bold
    if run.italic is not None:
        info.italic = run.italic
    if run.underline is not None:
        info.underline = run.underline
    if run.font.name:
        info.font_name = run.font.name
    if run.font.size:
        info.font_size = run.font.size.pt
    if run.font.color and run.font.color.rgb:
        info.color = str(run.font.color.rgb)
    return info


def extract_sections(doc_path: str) -> list[Section]:
    """从 DOCX 文件中提取所有信息区块（段落级）"""
    doc = Document(doc_path)
    all_paragraphs: list[ParagraphInfo] = []

    for idx, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue  # 跳过空段落，但保留索引映射

        props = _safe_get_paragraph_props(para)
        runs = [_get_run_info(r) for r in para.runs]

        p_info = ParagraphInfo(
            text=text,
            runs=runs,
            alignment=_get_alignment_str(para),
            style_name=props["style_name"],
            is_heading=props["is_heading"],
            heading_level=props["heading_level"],
            paragraph_index=idx,
        )
        all_paragraphs.append(p_info)

    # 按标题分割区块
    sections = _split_into_sections(all_paragraphs)
    return sections


def _split_into_sections(paragraphs: list[ParagraphInfo]) -> list[Section]:
    """将段落列表按标题/关键词分割为信息区块"""
    sections: list[Section] = []
    current_section: Optional[Section] = None

    # 区块标题关键词映射
    section_keywords = {
        "summary": ["个人总结", "自我评价", "自我介绍", "个人简介", "summary", "profile"],
        "experience": ["工作经历", "工作经验", "工作履历", "实习经历", "experience", "work"],
        "education": ["教育背景", "教育经历", "学历", "education"],
        "skills": ["技能", "专业技能", "技术栈", "skills", "technologies"],
        "projects": ["项目经历", "项目经验", "项目", "projects"],
    }

    for p in paragraphs:
        text_lower = p.text.lower().strip()

        # 判断是否为区块标题
        # 策略：段落较短（< 20 字）且匹配关键词，或者是 Heading 样式
        section_type = None
        is_likely_title = p.is_heading or len(p.text) < 20

        if is_likely_title:
            for s_type, keywords in section_keywords.items():
                for kw in keywords:
                    if kw in text_lower:
                        # 关键词必须占文本的主要部分，避免误匹配
                        text_ratio = len(kw) / max(len(text_lower), 1)
                        if text_ratio > 0.7 or text_lower == kw:
                            section_type = s_type
                            break
                if section_type:
                    break

        if section_type:
            # 开启新区块
            if current_section:
                sections.append(current_section)
            current_section = Section(
                type=section_type,
                title=p.text,
                paragraphs=[],
                paragraph_indices=[],
            )
        elif current_section is not None:
            # 追加到当前区块
            current_section.paragraphs.append(p)
            current_section.paragraph_indices.append(p.paragraph_index)
        else:
            # 第一个区块之前的内容（如姓名、联系方式）归入 summary
            current_section = Section(
                type="summary",
                title="",
                paragraphs=[p],
                paragraph_indices=[p.paragraph_index],
            )

    if current_section is not None and current_section not in sections:
        sections.append(current_section)

    return sections


# ─── 文本替换（保留样式） ────────────────────────────────────────


def _apply_run_style(run, run_info: RunInfo):
    """将 RunInfo 中的样式应用到目标 run"""
    if run_info.bold:
        run.bold = True
    if run_info.italic:
        run.italic = True
    if run_info.underline:
        run.underline = True
    if run_info.font_name:
        run.font.name = run_info.font_name
    if run_info.font_size:
        run.font.size = Pt(run_info.font_size)
    if run_info.color:
        run.font.color.rgb = RGBColor.from_string(run_info.color)


def _replace_paragraph_text(para, new_text: str, original_runs: list[RunInfo]):
    """替换段落文本，保留所有原始样式"""
    if not original_runs:
        # 没有原始 run 信息，直接清除重建
        for run in para.runs:
            run.text = ""
        if para.runs:
            para.runs[0].text = new_text
        else:
            para.add_run(new_text)
        return

    # 获取第一个 run 的样式作为回退
    first_run_info = original_runs[0]

    # 清除所有现有 run 的文本
    for run in para.runs:
        run.text = ""

    # 用第一个 run 的样式写入新文本
    if para.runs:
        target_run = para.runs[0]
        _apply_run_style(target_run, first_run_info)
        target_run.text = new_text
    else:
        new_run = para.add_run(new_text)
        _apply_run_style(new_run, first_run_info)


def apply_optimization(doc_path: str, optimized_json: dict, output_path: str) -> str:
    """
    将优化后的 JSON 内容回填到原始 DOCX 文件中，保留所有样式。

    Args:
        doc_path: 原始 DOCX 文件路径
        optimized_json: AI 优化后的简历 JSON（与原 parsed_json 结构一致）
        output_path: 输出 DOCX 文件路径

    Returns:
        output_path
    """
    doc = Document(doc_path)
    sections = extract_sections(doc_path)

    for section in sections:
        if section.type == "summary":
            _replace_summary(doc, section, optimized_json)
        elif section.type == "experience":
            _replace_experience(doc, section, optimized_json)
        elif section.type == "education":
            _replace_education(doc, section, optimized_json)
        elif section.type == "skills":
            _replace_skills(doc, section, optimized_json)
        elif section.type == "projects":
            _replace_projects(doc, section, optimized_json)

    doc.save(output_path)
    return output_path


def _replace_summary(doc: Document, section: Section, optimized: dict):
    """替换个人总结区块"""
    new_summary = optimized.get("summary", "")
    if not new_summary or not section.paragraphs:
        return

    # 找到第一个非标题段落，替换为新的 summary
    body_paras = [p for p in section.paragraphs if section.title not in p.text]
    if body_paras:
        target_para = doc.paragraphs[body_paras[0].paragraph_index]
        _replace_paragraph_text(target_para, new_summary, body_paras[0].runs)


def _replace_experience(doc: Document, section: Section, optimized: dict):
    """替换工作经历区块"""
    opt_exps = optimized.get("experience", [])
    if not opt_exps or not section.paragraphs:
        return

    # 收集所有非标题段落
    content_paras = [p for p in section.paragraphs if section.title not in p.text]
    if not content_paras:
        return

    # 按公司名分组（简单策略：遇到公司名就开新组）
    groups: list[list[ParagraphInfo]] = []
    current_group: list[ParagraphInfo] = []

    for p in content_paras:
        # 判断是否为"公司/职位"行（通常包含 @ 或 公司名）
        text = p.text.lower()
        is_company_line = any(
            kw in text for kw in ["@", "公司", "科技", "集团", "有限", "corporation", "inc"]
        )
        if is_company_line and current_group:
            groups.append(current_group)
            current_group = [p]
        else:
            current_group.append(p)

    if current_group:
        groups.append(current_group)

    # 将优化后的内容填回
    for i, group in enumerate(groups):
        if i >= len(opt_exps):
            break
        opt_exp = opt_exps[i]
        opt_points = opt_exp.get("points", [])
        n_points = len(opt_points)

        for j, p_info in enumerate(group):
            target_para = doc.paragraphs[p_info.paragraph_index]
            if j == 0:
                # 公司/职位行：替换为优化后的格式
                new_text = f"{opt_exp.get('title', '')} @ {opt_exp.get('company', '')}"
                period = f"{opt_exp.get('start', '')} - {opt_exp.get('end', '')}"
                if period.strip(" -"):
                    new_text += f"  |  {period}"
                _replace_paragraph_text(target_para, new_text, p_info.runs)
            else:
                point_idx = j - 1
                is_last = (j == len(group) - 1)
                if point_idx < n_points:
                    if is_last and point_idx < n_points - 1:
                        # 最后一个段落，合并所有剩余要点
                        _replace_paragraph_text(target_para, "；".join(opt_points[point_idx:]), p_info.runs)
                    else:
                        _replace_paragraph_text(target_para, opt_points[point_idx], p_info.runs)
                else:
                    # 优化后没有更多要点，清空多余段落
                    _replace_paragraph_text(target_para, "", p_info.runs)


def _replace_education(doc: Document, section: Section, optimized: dict):
    """替换教育背景区块（通常不需要优化，保留原样）"""
    opt_edus = optimized.get("education", [])
    if not opt_edus or not section.paragraphs:
        return

    content_paras = [p for p in section.paragraphs if section.title not in p.text]
    for i, p_info in enumerate(content_paras):
        if i >= len(opt_edus):
            break
        opt_edu = opt_edus[i]
        target_para = doc.paragraphs[p_info.paragraph_index]
        new_text = opt_edu.get("school", "")
        parts = [opt_edu.get("degree", ""), opt_edu.get("major", "")]
        degree = " - ".join(p for p in parts if p)
        if degree:
            new_text += f"  |  {degree}"
        period = f"{opt_edu.get('start', '')} - {opt_edu.get('end', '')}"
        if period.strip(" -"):
            new_text += f"  |  {period}"
        _replace_paragraph_text(target_para, new_text, p_info.runs)


def _replace_skills(doc: Document, section: Section, optimized: dict):
    """替换技能区块"""
    opt_skills = optimized.get("skills", [])
    if not opt_skills or not section.paragraphs:
        return

    content_paras = [p for p in section.paragraphs if section.title not in p.text]
    if content_paras:
        target_para = doc.paragraphs[content_paras[0].paragraph_index]
        new_text = "、".join(opt_skills) if isinstance(opt_skills, list) else str(opt_skills)
        _replace_paragraph_text(target_para, new_text, content_paras[0].runs)


def _replace_projects(doc: Document, section: Section, optimized: dict):
    """替换项目经历区块"""
    opt_projects = optimized.get("projects", [])
    if not opt_projects or not section.paragraphs:
        return

    content_paras = [p for p in section.paragraphs if section.title not in p.text]
    if not content_paras:
        return

    # 按项目名分组
    groups: list[list[ParagraphInfo]] = []
    current_group: list[ParagraphInfo] = []

    for p in content_paras:
        # 简单地：如果段落较短且包含"平台/系统/项目"等关键词，视为项目名
        text = p.text
        is_project_name = len(text) < 30 and any(
            kw in text for kw in ["平台", "系统", "项目", "应用", "管理", "platform"]
        )
        if is_project_name and current_group:
            groups.append(current_group)
            current_group = [p]
        else:
            current_group.append(p)

    if current_group:
        groups.append(current_group)

    for i, group in enumerate(groups):
        if i >= len(opt_projects):
            break
        opt_proj = opt_projects[i]

        for j, p_info in enumerate(group):
            target_para = doc.paragraphs[p_info.paragraph_index]
            if j == 0:
                _replace_paragraph_text(target_para, opt_proj.get("name", ""), p_info.runs)
            elif j == 1 and opt_proj.get("description"):
                _replace_paragraph_text(target_para, opt_proj["description"], p_info.runs)
            elif j == 2 and opt_proj.get("tech"):
                tech_text = f"技术栈：{', '.join(opt_proj['tech'])}"
                _replace_paragraph_text(target_para, tech_text, p_info.runs)


# ─── DOCX → PDF 转换 ──────────────────────────────────────────────


def docx_to_pdf(docx_path: str, output_path: Optional[str] = None) -> str:
    """
    将 DOCX 转换为 PDF。

    优先使用 LibreOffice 无头模式，回退到 python-docx2pdf（Windows COM），
    最后回退到 docx2pdf 库。
    """
    if output_path is None:
        output_path = docx_path.rsplit(".", 1)[0] + ".pdf"

    # 方案 1: LibreOffice 无头模式（跨平台，效果最好）
    try:
        import subprocess
        result = subprocess.run(
            [
                "libreoffice", "--headless", "--convert-to", "pdf",
                "--outdir", os.path.dirname(output_path) or ".",
                docx_path,
            ],
            capture_output=True, timeout=60,
        )
        generated = os.path.join(
            os.path.dirname(output_path) or ".",
            os.path.basename(docx_path).rsplit(".", 1)[0] + ".pdf",
        )
        if os.path.exists(generated) and generated != output_path:
            os.replace(generated, output_path)
        if os.path.exists(output_path):
            return output_path
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception) as e:
        logger.debug(f"LibreOffice 转换失败: {e}")

    # 方案 2: Windows COM (docx2pdf)
    try:
        from docx2pdf import convert
        convert(docx_path, output_path)
        if os.path.exists(output_path):
            return output_path
    except ImportError:
        logger.debug("docx2pdf 未安装")
    except Exception as e:
        logger.debug(f"docx2pdf 转换失败: {e}")

    # 方案 3: 纯 Python 报告
    raise RuntimeError(
        f"无法将 DOCX 转换为 PDF。请安装 LibreOffice 或 pip install docx2pdf。"
        f"\n临时文件已保存到: {docx_path}"
    )