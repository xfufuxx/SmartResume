"""LLM 调用计费策略：免费额度清单、付费拦截、费用预估。

背景（依据阿里云百炼官方文档，2026-10 核对）
------------------------------------------
1. 百炼对部分模型发放**免费额度**（千问/DeepSeek 系列多为 100 万 Token），
   有效期自「开通百炼 / 模型发布 / 申请通过」起 **90 天**（取较晚者）。
   → 免费额度**一定会到期**；到期后即使一个 Token 都没用满，也会转为按量计费。
2. 免费额度只对**在线推理**生效；Batch 推理、微调、专属算力部署不计入免费额度。
3. 部分模型（如 qwen3.8-max-prime）**根本没有免费额度**。
4. 免费额度**仅华北2（北京）地域**发放，其他地域走按量计费。
5. 控制台「模型用量」页显示的剩余比例，只是**该额度自身的余量**。
   判断一个模型现在还能不能白嫖，要看它**在不在免费额度清单里**，
   而不是看剩余比例数字（额度已到期的模型，余量照样显示 100%）。

因此本项目统一用本模块维护「免费额度清单 + 到期日 + 单价」，
所有 LLM 调用点在发请求前先过 `check_before_call()`。

参考：
  价格/免费额度 https://help.aliyun.com/zh/document_detail/2713035.html
  免费额度管理 https://help.aliyun.com/zh/user-center/manage-free-trials
  控制台        https://bailian.console.aliyun.com  → 模型用量 → 免费额度
"""

from __future__ import annotations

import logging
import re
from datetime import date

logger = logging.getLogger(__name__)

# 模型 → 免费额度到期日（None 表示永不过期 / 非文本模型）
# 数据来源：百炼控制台「模型用量 - 免费额度」列表，2026-10-25 按用户截图逐行核对。
# 口径：到期日 = 模型发布日 + 90 天（取「开通百炼/模型发布/申请通过」较晚者）。
# ⚠️ 控制台只列「仍在有效期」的额度：qwen3.7-flash（10-23 到期）已下架，条目保留
#    仅供 billing_info 识别历史配置；qwen3.7-max 两页截图均未出现（可能已用完或在
#    其他分页），2026-10-25 实测仍可调用，到期日暂按 11-01 保留待观察。
FREE_QUOTA_MODELS: dict[str, date | None] = {
    # ── 文本对话模型（优化/匹配链路可降级候选） ──
    "deepseek-v4.1-flash": date(2026, 12, 13),  # console：100% 剩余；⚠️ 思考模型（见 REASONING_MODELS）
    "qwen3.8-flash": date(2026, 11, 25),        # console：100% 剩余，剩 31 天
    "glm-5.3": date(2026, 11, 23),              # console：100% 剩余，剩 29 天
    "deepseek-v4-pro-0813": date(2026, 11, 13),  # console：100% 剩余，剩 19 天
    "qwen3.8-max": date(2026, 11, 1),           # console：已消耗 93.82%，剩 7 天
    "qwen3.8-max-0902": date(2026, 12, 1),      # console 到期 12-01：max 档里 runway 最长、余量 100%
    "qwen3.7-max": date(2026, 11, 1),           # 截图未出现；10-25 实测可用
    "qwen3.7-max-2026-06-08": date(2026, 11, 1),
    "qwen3.7-flash": date(2026, 10, 23),        # 已到期（console 已下架），仅备案
    "qwen3.7-flash-2026-07-15": date(2026, 10, 23),
    # ── 非文本模型（按 chars/seconds/images 计量，见 NON_TEXT_MODELS，仅备案） ──
    "qwen-mt-uni": date(2026, 12, 15),          # 机器翻译
    "qwen3.7-text-rerank": date(2026, 11, 30),  # 文本重排
    "qwen-mt-image-2.0": date(2026, 11, 27),    # 图片翻译（100 张/期，非通用视觉）
    "wan3.0-video-prime": date(2026, 11, 21),   # 视频生成（30 秒/期）
    "qwen3-asr-flash": date(2026, 11, 19),      # 语音识别（36K 秒/期）
    "cosyvoice-v1": date(2026, 12, 31),
    "cosyvoice-clone-v1": date(2026, 12, 31),
    "sambart-zhyuan-v1": None,                  # console：永不过期
    "sambart-zhinan-v1": None,
    "sambart-zhigui-v1": None,
    "sambart-zhichu-v1": None,
    "sambart-hanna-v1": None,
    "sambart-clara-v1": None,
    "sambart-eva-v1": None,
}

# 非文本模型：语音合成/识别、机器翻译、向量、重排、视频、图片翻译。
# 按 chars/seconds/images 计量，**文本与视觉对话链路均不可用**——自动降级若挑中
# 它们会直接坏菜（max 档 11-01 到期后，旧实现按字母序会降级到 cosyvoice）。
# 两条被控制台截断的全名待用户确认（均是非对话模型，不影响文本链路）：
#   qwen3.8-livetranslate-flas…（到期 2026-12-16，实时翻译）
#   qwen3.7-text-embedding-f…（到期 2026-11-30，文本向量）
NON_TEXT_MODELS: frozenset[str] = frozenset({
    "cosyvoice-v1", "cosyvoice-clone-v1",
    "qwen3-asr-flash",
    "qwen-mt-uni", "qwen-mt-image-2.0",
    "qwen3.7-text-rerank",
    "wan3.0-video-prime",
    "qwen3.8-livetranslate-flash",     # 全名待确认（console 截断显示）
    "qwen3.7-text-embedding-flash",    # 全名待确认（console 截断显示）
    "sambart-zhyuan-v1", "sambart-zhinan-v1", "sambart-zhigui-v1",
    "sambart-zhichu-v1", "sambart-hanna-v1", "sambart-clara-v1", "sambart-eva-v1",
})

# 视觉对话模型（图文理解）：控制台免费额度清单里**暂无**——qwen-mt-image-2.0 是
# 图片翻译而非通用视觉模型。因此视觉链路不参与自动降级：额度耗尽时由 llm_errors
# 转中文提示（充值/换 Key），而不是把图片请求降级到文本模型。
VISION_MODELS: frozenset[str] = frozenset()

# 思考（reasoning）模型：先产出 reasoning_content 再产出 content，小 max_tokens 下
# content 直接为空（实测 deepseek-v4.1-flash max_tokens=8 返回空串）。本项目管线是
# 「JSON 输出 + 有界 max_tokens」，思考模型有静默空返回风险——自动降级时排到最后，
# 只在没有其它替补时才用（白嫖 runway 能多撑约 12 天）。
REASONING_MODELS: frozenset[str] = frozenset({"deepseek-v4.1-flash"})

# 文本链路的质量优先档（max 级）：同档内再按剩余免费天数降序挑。
MAX_TIER_MODELS: frozenset[str] = frozenset({
    "qwen3.8-max", "qwen3.7-max", "qwen3.8-max-0902",
})

# 无免费额度、但项目里可能出现的模型（显式登记，避免误判成"免费")
NO_FREE_QUOTA_MODELS: set[str] = {
    "qwen3.7-plus",          # 免费额度 100 万 Token，有效期到 2026-08-24 已过期
    "qwen3.7-plus-2026-05-26",
    "qwen3.6-plus",
    "qwen-plus",
    "qwen-turbo",
    "qwen-max",
    "qwen3.8-max-prime",     # 官方文档明确：无免费额度
}

# 单价表：元 / 百万 Token（华北2（北京），非思考模式，0<Token≤256K）
# 仅用于费用预估，实际以阿里云账单为准。
PRICING_CNY_PER_MTOK: dict[str, tuple[float, float]] = {
    "qwen3.7-plus": (2.0, 8.0),
    "qwen-plus": (2.0, 8.0),
    "qwen3.7-flash": (0.2, 0.8),
    "qwen3.8-flash": (0.2, 0.8),      # 与 3.7-flash 同档（flash 档）
    "qwen-turbo": (0.8, 2.4),
    "qwen3.8-max": (12.0, 36.0),
    "qwen3.7-max": (12.0, 36.0),
    "deepseek-v4-pro-0813": (2.0, 8.0),
}
_FALLBACK_PRICING = (2.0, 8.0)  # 未知模型按 Plus 档保守估算


def normalize_model(model: str) -> str:
    """把模型别名归一到清单里的主模型名（如 qwen3.7-plus-2026-05-26 → qwen3.7-plus）。"""
    if not model:
        return ""
    m = model.strip()
    # 1) 带日期/版本快照的后缀 → 先归一到主名（如 qwen3.7-flash-2026-07-15 → qwen3.7-flash）。
    #    必须先于「直接命中」：快照别名本身也登记在清单里（记录各自的到期日），
    #    但单价表只有主名——不归一会让快照调用按保守价（Plus 档）估算。
    stripped = re.sub(r"-\d{4}(?:-\d{2}){0,2}$", "", m)
    if stripped != m and (stripped in FREE_QUOTA_MODELS or stripped in NO_FREE_QUOTA_MODELS):
        return stripped
    # 2) 直接命中（含 deepseek-v4-pro-0813 这类去后缀后不在清单的快照名）
    if m in FREE_QUOTA_MODELS or m in NO_FREE_QUOTA_MODELS:
        return m
    # 3) 清单里任一主名是 m 的前缀
    for base in list(FREE_QUOTA_MODELS) + list(NO_FREE_QUOTA_MODELS):
        if m.startswith(base):
            return base
    return m


def billing_info(model: str) -> dict:
    """返回该模型的计费信息：是否走免费额度、到期日、单价。"""
    norm = normalize_model(model)
    if norm in NO_FREE_QUOTA_MODELS:
        return {
            "model": model, "normalized": norm, "has_free_quota": False,
            "expiry": None, "reason": "模型不在百炼免费额度清单内（或免费额度已过期）",
            "price_in_cny_per_mtok": PRICING_CNY_PER_MTOK.get(norm, _FALLBACK_PRICING)[0],
            "price_out_cny_per_mtok": PRICING_CNY_PER_MTOK.get(norm, _FALLBACK_PRICING)[1],
        }
    if norm in FREE_QUOTA_MODELS:
        expiry = FREE_QUOTA_MODELS[norm]
        if expiry and expiry < date.today():
            reason = f"免费额度已于 {expiry} 到期"
        elif not expiry:
            reason = "清单未标注到期日"
        else:
            reason = ""
        return {
            "model": model, "normalized": norm, "has_free_quota": True,
            "expiry": expiry,
            "reason": reason,
            "price_in_cny_per_mtok": PRICING_CNY_PER_MTOK.get(norm, _FALLBACK_PRICING)[0],
            "price_out_cny_per_mtok": PRICING_CNY_PER_MTOK.get(norm, _FALLBACK_PRICING)[1],
        }
    return {
        "model": model, "normalized": norm, "has_free_quota": False,
        "expiry": None, "reason": "未知模型，按付费模型处理（保守）",
        "price_in_cny_per_mtok": _FALLBACK_PRICING[0],
        "price_out_cny_per_mtok": _FALLBACK_PRICING[1],
    }


def estimate_cost_cny(model: str, input_tokens: int, output_tokens: int) -> float:
    """预估一次调用的费用（元）。走免费额度的模型返回 0。"""
    info = billing_info(model)
    if info["has_free_quota"]:
        return 0.0
    pin, pout = info["price_in_cny_per_mtok"], info["price_out_cny_per_mtok"]
    return input_tokens / 1_000_000 * pin + output_tokens / 1_000_000 * pout


def format_cost(cny: float) -> str:
    if cny <= 0:
        return "¥0（走免费额度）"
    if cny < 0.01:
        return f"¥{cny:.4f}"
    if cny < 1:
        return f"¥{cny:.3f}"
    return f"¥{cny:.2f}"


class PaidCallBlocked(RuntimeError):
    """命中付费模型且处在「仅允许免费额度」模式时抛出。"""


def resolve_model(requested: str, kind: str = "text") -> tuple[str, str]:
    """决定「这次到底用哪个模型」。

    开启 LLM_AUTO_FALLBACK 时：
      - 请求的是付费模型 / 免费额度已过期的模型 → 自动换成仍在免费期内的替补；
      - 返回 (最终模型, 切换说明)，说明为空表示没换。
    关闭时保持原样，交给 check_before_call() 去拦截。
    """
    from app.config import settings

    if not getattr(settings, "LLM_AUTO_FALLBACK", False):
        return requested, ""

    info = billing_info(requested)
    if info["has_free_quota"] and info["expiry"] and info["expiry"] >= date.today():
        return requested, ""

    fallback = pick_free_model(kind)
    if not fallback or fallback == requested:
        return requested, ""
    note = (
        f"原模型 {requested} 不在免费额度内（{info['reason']}），"
        f"已按 LLM_AUTO_FALLBACK 自动切换到 {fallback}"
    )
    return fallback, note


def check_before_call(model: str, task: str, estimated_input_tokens: int = 0,
                      estimated_output_tokens: int = 0, retry_budget: int = 1) -> dict:
    """调用前的计费检查。

    - 走免费额度：直接放行。
    - 走付费：写 WARNING 日志（含预估费用）；
      若 settings.LLM_ALLOW_PAID=false，直接抛 PaidCallBlocked，绝不发请求。
    - retry_budget：该调用点最多会发几次请求（重试会重复计费），用于放大预估。
    """
    from app.config import settings

    info = billing_info(model)
    # 重试会重复计费：3 次重试 = 最多 4 次请求，预估必须按上界放大
    est = estimate_cost_cny(model, estimated_input_tokens, estimated_output_tokens) * max(1, retry_budget)
    # 「在免费清单里」≠「现在还能白嫖」：额度已到期同样按量计费，
    # 仅免费模式下必须本地拦截（否则请求发到上游也是 403）
    still_free = bool(info["has_free_quota"]) and (
        not info["expiry"] or info["expiry"] >= date.today()
    )
    detail = (
        f"[LLM 计费] 任务={task} 模型={model} "
        f"{'走免费额度' if still_free else '按量计费⚠️ (' + info['reason'] + ')'}"
        f" 预估费用={format_cost(est)}"
    )
    if still_free:
        if info["expiry"]:
            days = (info["expiry"] - date.today()).days
            tail = f"，免费额度到期 {info['expiry']}（剩 {days} 天）"
            detail += tail
            if days <= 10:
                logger.warning(detail + " —— 额度临近到期，建议切换模型")
            else:
                logger.info(detail)
        else:
            logger.info(detail)
        return {**info, "estimated_cost_cny": 0.0}

    logger.warning(detail + "；如需允许付费调用，设置环境变量 LLM_ALLOW_PAID=true")
    if not getattr(settings, "LLM_ALLOW_PAID", True):
        raise PaidCallBlocked(
            f"当前为「仅免费额度」模式，拒绝调用付费模型 {model}（{info['reason']}）。"
            f"预估费用 {format_cost(est)}。"
            f"处理方式：① 把 LLM_MODEL_TEXT / LLM_MODEL_VISION 换成免费额度内的模型；"
            f"② 或显式设置环境变量 LLM_ALLOW_PAID=true 允许按量计费。"
        )
    return {**info, "estimated_cost_cny": est}


def _days_left(model: str) -> int:
    """距免费额度到期的天数；不在清单/已过期返回 -1，永不过期按 99999 计。"""
    if model not in FREE_QUOTA_MODELS:
        return -1
    expiry = FREE_QUOTA_MODELS[model]
    if expiry is None:
        return 99999
    return (expiry - date.today()).days


def pick_free_model(kind: str = "text", expired_only: bool = False) -> str | None:
    """在仍在免费额度有效期内的模型里挑一个作为替补。

    kind: "text" 选文本模型；"vision" 选视觉模型。
    expired_only: 只从「额度已过期的模型」里挑（换人名单诊断用）。
    返回 None 表示没有可用候选。

    两条纪律（2026-10-25 控制台核对后加固）：
    1. **非文本模型永不入选**（NON_TEXT_MODELS）：语音/翻译/向量/视频模型进了
       文本链路会直接坏菜——max 档 11-01 到期后，旧实现按字母序会挑中 cosyvoice；
    2. **同档按剩余天数降序**：活得久的替补先上，避免每 7 天被迫再迁移一次；
    3. **思考模型排最后**（REASONING_MODELS）：小 max_tokens 下 content 为空，
       JSON 管线有静默失败风险，只在没有其它替补时启用。
    """
    today = date.today()
    if expired_only:
        pool = [m for m, e in FREE_QUOTA_MODELS.items() if e and e < today]
        pool += sorted(NO_FREE_QUOTA_MODELS)
    else:
        pool = [
            m for m, e in FREE_QUOTA_MODELS.items()
            if e and e >= today and m not in NON_TEXT_MODELS
        ]

    if kind == "vision":
        # 只认真正的视觉对话模型；清单内暂无（见 VISION_MODELS 注释）
        pool = [m for m in pool if m in VISION_MODELS]
        pool.sort(key=lambda m: (-_days_left(m), m))
    else:
        # 文本：max 档优先 > 非思考 > 剩余天数降序 > 名字升序
        pool.sort(key=lambda m: (
            m not in MAX_TIER_MODELS,
            m in REASONING_MODELS,
            -_days_left(m),
            m,
        ))
    return pool[0] if pool else None


def free_quota_report() -> str:
    """生成一份人类可读的免费额度清单（供 CLI 使用）。"""
    lines = ["免费额度清单（百炼，按到期日升序）:"]
    rows = [(m, e) for m, e in FREE_QUOTA_MODELS.items() if e]
    for m, e in sorted(rows, key=lambda x: x[1]):
        days = (e - date.today()).days
        flag = "可用" if days >= 0 else "已过期"
        lines.append(f"  [{flag:4}] {m:26} 到期 {e}（剩 {days} 天）")
    lines.append("无免费额度（调用即计费）:")
    for m in sorted(NO_FREE_QUOTA_MODELS):
        lines.append(f"  [计费] {m}")
    return "\n".join(lines)
