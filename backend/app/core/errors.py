"""统一错误码与中文可操作提示。

替代散落在各端点中的英文技术串（如 "Resume not found"），为前端提供
可直接展示、并附带恢复建议的中文错误信息。所有对外 HTTPException 优先走本模块。
"""
from fastapi import HTTPException

# code -> (HTTP 状态码, 中文提示模板)
ERRORS: dict[str, tuple[int, str]] = {
    # 通用
    "RESUME_NOT_FOUND": (404, "简历不存在或已被删除"),
    "JOB_NOT_FOUND": (404, "岗位不存在或已被删除"),
    "OPTIMIZATION_NOT_FOUND": (404, "优化记录不存在或已被删除"),
    "RESOURCE_NOT_FOUND": (404, "请求的资源不存在或已被删除"),
    "UNAUTHORIZED": (401, "登录已过期，请重新登录"),
    "FORBIDDEN": (403, "没有访问权限"),
    # 文件上传
    "FILE_TYPE_INVALID": (400, "仅支持 PDF / Word / 图片（PNG、JPG、WEBP）格式文件"),
    "FILE_TOO_LARGE": (413, "文件过大，请上传 20MB 以内的文件"),
    "FILE_CONTENT_INVALID": (400, "文件内容无法识别，请确认文件未损坏或尝试其他格式"),
    "PDF_PAGE_LIMIT": (400, "PDF 页数过多（上限 50 页），请拆分或压缩后重试"),
    # 解析 / 处理
    "RESUME_PARSE_FAILED": (400, "简历解析失败，请尝试更清晰的 PDF，或改用 Word 格式后重试"),
    "JOB_PARSE_FAILED": (400, "岗位图片解析失败，请确认图片清晰、文字未被遮挡后重试"),
    "PARSE_BEFORE_OPTIMIZE": (400, "简历或岗位尚未解析完成，请先等待解析结束再优化"),
    # 配额 / 限流
    "QUOTA_EXCEEDED": (402, "今日优化次数已用完，升级会员可继续优化"),
    "RATE_LIMITED": (429, "操作过于频繁，请稍候 {seconds} 秒后重试"),
    # 业务约束
    "RESUME_LIMIT_REACHED": (400, "简历数量已达上限，请先删除不需要的简历"),
    "ALREADY_RATED": (409, "该记录已评价过，无需重复提交"),
    "INVALID_SCORE": (400, "评分需在 1-5 之间"),
    "FEEDBACK_TOO_LONG": (400, "反馈文字不能超过 200 字"),
    "EMPTY_TEXT": (400, "文本不能为空"),
}


def app_err(code: str, **kwargs) -> HTTPException:
    """根据错误码抛出中文 HTTPException；kwargs 用于格式化提示模板。"""
    if code not in ERRORS:
        return HTTPException(status_code=500, detail="未知错误")
    status_code, template = ERRORS[code]
    try:
        detail = template.format(**kwargs) if kwargs else template
    except (KeyError, IndexError):
        detail = template
    return HTTPException(status_code=status_code, detail=detail)
