"""
文件格式转换服务。

支持：
- PDF → DOCX（使用 pdf2docx 或 PyMuPDF）
- 临时文件管理
"""

import os
import uuid
import logging
import shutil
from typing import Optional

logger = logging.getLogger(__name__)

TEMP_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "temp_conversions")
os.makedirs(TEMP_DIR, exist_ok=True)


def pdf_to_docx(pdf_path: str, output_path: Optional[str] = None) -> str:
    """
    将 PDF 文件转换为 DOCX。

    优先使用 pdf2docx 库，回退到 PyMuPDF 纯文本提取。

    Args:
        pdf_path: 源 PDF 文件路径
        output_path: 目标 DOCX 路径，不指定则自动生成

    Returns:
        生成的 DOCX 文件路径
    """
    if output_path is None:
        filename = os.path.basename(pdf_path).rsplit(".", 1)[0]
        output_path = os.path.join(TEMP_DIR, f"{filename}_{uuid.uuid4().hex[:8]}.docx")

    # 方案 1: pdf2docx（保留排版最佳）
    try:
        from pdf2docx import Converter
        cv = Converter(pdf_path)
        cv.convert(output_path, start=0, end=None)
        cv.close()
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            logger.info(f"pdf2docx 转换成功: {output_path}")
            return output_path
    except ImportError:
        logger.warning("pdf2docx 未安装，回退到 PyMuPDF")
    except Exception as e:
        logger.warning(f"pdf2docx 转换失败: {e}，回退到 PyMuPDF")

    # 方案 2: PyMuPDF 提取文本 + 简单排版
    try:
        import fitz
        from docx import Document
        from docx.shared import Pt

        doc = Document()
        pdf_doc = fitz.open(pdf_path)

        for page in pdf_doc:
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if block["type"] == 0:  # 文本块
                    for line in block["lines"]:
                        text = "".join([span["text"] for span in line["spans"]])
                        if text.strip():
                            para = doc.add_paragraph(text.strip())
                            # 尝试保留字体大小
                            if line["spans"]:
                                first_span = line["spans"][0]
                                if first_span.get("size"):
                                    for run in para.runs:
                                        run.font.size = Pt(first_span["size"])

        pdf_doc.close()
        doc.save(output_path)
        logger.info(f"PyMuPDF 转换成功: {output_path}")
        return output_path
    except ImportError:
        raise ImportError(
            "PDF 转换需要安装 pdf2docx 或 PyMuPDF。"
            "请运行: pip install pdf2docx"
        )
    except Exception as e:
        raise RuntimeError(f"PDF 转 DOCX 失败: {e}")


def get_file_extension(file_path: str) -> str:
    """获取文件扩展名（小写，不含点）"""
    return os.path.splitext(file_path)[1].lower().lstrip(".")


def ensure_docx(file_path: str) -> str:
    """
    确保返回 DOCX 文件路径。如果输入是 PDF，先转换为 DOCX。

    Args:
        file_path: 原始文件路径

    Returns:
        DOCX 文件路径
    """
    ext = get_file_extension(file_path)
    if ext == "docx":
        return file_path
    if ext == "pdf":
        return pdf_to_docx(file_path)
    raise ValueError(f"不支持的文件格式: {ext}，仅支持 .docx 和 .pdf")


def cleanup_temp(keep_minutes: int = 30):
    """清理临时转换文件"""
    import time
    now = time.time()
    cutoff = now - keep_minutes * 60

    for fname in os.listdir(TEMP_DIR):
        fpath = os.path.join(TEMP_DIR, fname)
        try:
            if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                os.remove(fpath)
                logger.debug(f"清理临时文件: {fpath}")
        except OSError:
            pass