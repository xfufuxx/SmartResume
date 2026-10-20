#!/usr/bin/env python
"""LLM 计费体检：一眼看清当前配置会不会产生费用。

用法（必须在 backend/ 目录下运行，.env 是按工作目录解析的）：
    cd backend && ./.venv/Scripts/python.exe check_llm_policy.py
    cd backend && ./.venv/Scripts/python.exe check_llm_policy.py --probe   # 附带一次真实连通性探测
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.llm_policy import (  # noqa: E402
    FREE_QUOTA_MODELS,
    NO_FREE_QUOTA_MODELS,
    billing_info,
    check_before_call,
    estimate_cost_cny,
    format_cost,
    pick_free_model,
    resolve_model,
)
from app.config import settings  # noqa: E402


def _rule(title: str = "") -> None:
    print("\n" + "=" * 62)
    if title:
        print(title)
        print("=" * 62)


def main() -> int:
    parser = argparse.ArgumentParser(description="检查当前 LLM 配置是否会产生费用")
    parser.add_argument("--probe", action="store_true",
                        help="额外发一次最小请求，验证模型当前是否可调用")
    args = parser.parse_args()

    _rule("1. 当前配置")
    print(f"  端点           : {settings.LLM_API_BASE}")
    print(f"  Key 已配置     : {'是' if settings.LLM_API_KEY else '否'}")
    print(f"  文本模型       : {settings.LLM_MODEL_TEXT}")
    print(f"  视觉模型       : {settings.LLM_MODEL_VISION}")
    print(f"  允许按量计费   : {settings.LLM_ALLOW_PAID}"
          f"（{'会打 WARNING 提醒' if settings.LLM_ALLOW_PAID else '命中付费模型将直接拒绝，不会产生账单'}）")
    auto = bool(getattr(settings, "LLM_AUTO_FALLBACK", False))
    fb_text = pick_free_model("text") or "（无候选）"
    fb_vision = pick_free_model("vision") or "（无候选）"
    print(f"  自动降级       : {auto}（额度用尽时自动换 -> 文本 {fb_text} / 视觉 {fb_vision}）")

    _rule("2. 计费体检")
    ok = True
    for role, model in (("文本", settings.LLM_MODEL_TEXT), ("视觉", settings.LLM_MODEL_VISION)):
        info = billing_info(model)
        if info["has_free_quota"]:
            exp = info["expiry"]
            days = (exp - __import__("datetime").date.today()).days if exp else None
            status = f"✅ 走免费额度（额度余量在控制台看，到期 {exp}，剩 {days} 天）" if days and days >= 0 \
                else "❌ 免费额度已过期/无额度" if days is not None else "✅ 走免费额度"
            print(f"  [{role}] {model:20} {status}")
            ok = ok and (days is None or days >= 0)
        else:
            cost = estimate_cost_cny(model, 3000, 1200)
            print(f"  [{role}] {model:20} ⚠️ 按量计费 —— {info['reason']}"
                  f"（预估单次约 {format_cost(cost)}）")
            ok = False

        # 实际生效的模型（考虑自动降级）
        eff, note = resolve_model(model, kind="vision" if role == "视觉" else "text")
        if eff != model:
            print(f"       → 实际会用到 {eff}（自动降级：{note}）")

        if info["has_free_quota"] or auto:
            continue
        print("       → 当前「仅免费额度」模式，调用会被直接拒绝")
        print("         修复：把 .env 里的模型换成免费额度清单内的，或设 LLM_ALLOW_PAID=true")

    _rule("3. 免费额度清单（百炼，按到期日升序）")
    rows = [(m, e) for m, e in FREE_QUOTA_MODELS.items() if e]
    for m, e in sorted(rows, key=lambda x: x[1]):
        days = (e - __import__("datetime").date.today()).days
        flag = "可用" if days >= 0 else "过期"
        print(f"  [{flag:4}] {m:26} 到期 {e}（剩 {days} 天）")
    print("  无免费额度（调用即计费）:")
    for m in sorted(NO_FREE_QUOTA_MODELS):
        print(f"  [计费] {m}")

    _rule("4. 典型调用预估（按 输入3k / 输出1.2k Token 估算）")
    for role, model in (("文本", settings.LLM_MODEL_TEXT), ("视觉", settings.LLM_MODEL_VISION)):
        print(f"  [{role}] {model:20} {format_cost(estimate_cost_cny(model, 3000, 1200))}")
    print("  说明：视觉调用图片会折算输入 Token，图片越大越贵；实际以阿里云账单为准。")

    if args.probe:
        _rule("5. 连通性探测（真实发一次请求 + 账号状态判定）")
        from app.services import get_llm_client, llm_invoke
        try:
            client = get_llm_client(settings.LLM_MODEL_TEXT, "计费体检探测")
            resp = await_client(client, settings.LLM_MODEL_TEXT)
            print(f"  ✅ 模型可调用，返回：{resp}")
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            code = _error_code(msg)
            print("  ❌ 调用失败：" + code)
            print("     " + msg.replace("\n", " ")[:300])
            print()
            if code == "Arrearage":
                print("  判定：模型可达、Key 有效，但**账号整体**被拒。")
                print("  关键区分：这不是「某个模型额度用完了」，而是账号级欠费——")
                print("  哪怕免费额度还剩 90% 的模型也会被同样拒绝。")
                print("  处理：")
                print("    1) 查余额（是否为负）：https://home.console.aliyun.com/balance")
                print("    2) 百炼费用页：https://bailian.console.aliyun.com")
                print("    3) 充值后本条命令直接可复测，无需改任何配置")
            elif code == "invalid api key":
                print("  判定：Key 无效/已删除。请重新生成并更新 backend/.env 的 LLM_API_KEY。")
            elif code == "Unknown":
                print("  判定：非计费类错误，参考上面的原始报错。")

    _rule("6. 账号状态速查")
    print("  免费额度是否可用，只看三件事：")
    print("    ① 该模型在不在百炼免费额度清单里（本工具第 3 节）")
    print("    ② 额度到期日是否晚于今天（本工具第 3 节，到期即转按量计费）")
    print("    ③ 账号余额是否为正（账号欠费时全部模型都会被拒，与本配置无关）")
    print("  控制台「剩余比例」只代表额度自身余量，额度过期后照样显示 100%，不能作为判断依据。")

    print()
    if ok:
        print("结论：当前配置全部基于免费额度，正常调用不会产生费用 ✅")
    else:
        print("结论：存在按量计费的模型，按上面提示调整后再调用 ⚠️")
    return 0


def _error_code(msg: str) -> str:
    """从报错里抽出可读的错误类型标签。"""
    if "Arrearage" in msg:
        return "Arrearage（账号欠费/账号级拒绝）"
    if "invalid api key" in msg.lower() or "Incorrect API key" in msg:
        return "invalid api key（Key 无效）"
    if "insufficient" in msg.lower() or "quota exceeded" in msg.lower():
        return "quota exceeded（额度/配额不足）"
    if "Unauthorized" in msg or "401" in msg:
        return "Unauthorized（鉴权失败）"
    if "Not Found" in msg or "404" in msg or "does not exist" in msg.lower():
        return "model not found（模型名不存在）"
    return "Unknown"


def await_client(client, model: str) -> str:
    """同步执行（CLI 场景，避免引入额外事件循环样板）。走 llm_invoke 以保持一致记账。"""
    import asyncio

    from app.services import llm_invoke

    async def _run():
        r = await llm_invoke(client, model, "计费体检探测",
                             messages=[
            {"role": "user", "content": "回复两个字：正常"}
        ], max_tokens=16)
        return r.choices[0].message.content

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
