"""文件安全校验：在不依赖额外第三方库的前提下，基于文件头（magic bytes）
验证上传文件的真实类型，防止「改扩展名上传可执行文件」类攻击（P0 安全项）。

同时提供 PDF 页数上限校验（需 PyMuPDF）。
"""
import struct
from app.core.errors import app_err

# 扩展名 -> 允许的头部特征（满足任一即通过）
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "pdf": [b"%PDF"],
    "docx": [b"PK\x03\x04"],  # DOCX 本质是 ZIP 容器
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "webp": [b"RIFF"],  # WEBP 以 RIFF 开头，需在偏移 8 处含 "WEBP"
}

MAX_PDF_PAGES = 50


def _head_matches(content: bytes, ext: str) -> bool:
    sigs = _MAGIC_SIGNATURES.get(ext)
    if not sigs:
        return True  # 未知类型不拦截（由调用方白名单控制）
    for sig in sigs:
        if content[: len(sig)] == sig:
            if ext == "webp":
                # 校验 RIFF 容器内的 WEBP 标识
                return content[8:12] == b"WEBP"
            return True
    return False


def validate_file_magic(content: bytes, ext: str) -> None:
    """校验文件真实类型。不通过则抛出中文 400 错误。"""
    if not content:
        raise app_err("FILE_CONTENT_INVALID")
    if not _head_matches(content, ext):
        raise app_err("FILE_CONTENT_INVALID")


def validate_pdf_pages(content: bytes) -> None:
    """校验 PDF 页数不超过上限（无 PyMuPDF 时跳过）。"""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        pages = doc.page_count
        doc.close()
        if pages > MAX_PDF_PAGES:
            raise app_err("PDF_PAGE_LIMIT")
    except app_err:
        raise
    except Exception:
        # 无法打开则交由上层解析流程报错，这里不阻断
        return
