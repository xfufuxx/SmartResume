"""千问（阿里云百炼）API 连通性自检脚本。

用途
----
填好 `backend/.env` 里的 `LLM_API_KEY` 之后，跑一遍确认四件事都对：
  1. base_url 指向的端点可达
  2. API Key 有效
  3. 文本模型（LLM_MODEL_TEXT）可用
  4. 视觉模型（LLM_MODEL_VISION）可用

用法（必须先进入 backend/ 目录，因为 `.env` 按工作目录解析）
--------------------------------------------------------------
    .venv/Scripts/python.exe verify_qwen_api.py              # 文本 + 视觉
    .venv/Scripts/python.exe verify_qwen_api.py --text-only  # 只测文本（不花视觉的钱）
    .venv/Scripts/python.exe verify_qwen_api.py --image ../岗位.png
    .venv/Scripts/python.exe verify_qwen_api.py --list-models

说明
----
* 会产生**真实的 API 调用**，有少量费用；`--text-only` 可跳过视觉那一次。
* 本脚本只读配置、只发请求，**不写任何文件、不碰数据库**。
* 文件名刻意不用 `test_` 前缀，避免被 pytest 收集成用例。
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import sys
from pathlib import Path

from openai import AsyncOpenAI

from app.config import settings
from app.services import has_valid_api_key

# 视觉测试的候选样例图（相对 backend/ 目录）
_IMAGE_CANDIDATES = [
    Path("../岗位.png"),
    Path("../样例图/AI优化.png"),
]


def _mask(key: str | None) -> str:
    if not key:
        return "<未设置>"
    return f"{key[:7]}…{key[-4:]}（长度 {len(key)}）" if len(key) > 12 else "<过短，疑似占位符>"


def print_config() -> None:
    print("=" * 68)
    print("当前 LLM 配置（读自 backend/.env，Key 已掩码）")
    print("=" * 68)
    print(f"  LLM_API_BASE    : {settings.LLM_API_BASE}")
    print(f"  LLM_API_KEY     : {_mask(settings.LLM_API_KEY)}")
    print(f"  LLM_MODEL_TEXT  : {settings.LLM_MODEL_TEXT}")
    print(f"  LLM_MODEL_VISION: {settings.LLM_MODEL_VISION}")
    ok = has_valid_api_key()
    print(f"  占位符检查      : {'通过（看起来是真实 Key）' if ok else '未通过（仍是占位符或为空）'}")
    print()


def pick_image(explicit: str | None) -> Path | None:
    if explicit:
        p = Path(explicit)
        return p if p.is_file() else None
    for p in _IMAGE_CANDIDATES:
        if p.is_file():
            return p
    return None


async def test_text(client: AsyncOpenAI) -> bool:
    print("[1/2] 文本模型测试")
    print(f"      model = {settings.LLM_MODEL_TEXT}")
    try:
        resp = await client.chat.completions.create(
            model=settings.LLM_MODEL_TEXT,
            messages=[
                {"role": "system", "content": "你是一个简洁的助手，只输出 JSON。"},
                {"role": "user", "content": '返回 {"ok": true, "platform": "qwen"} 这个 JSON，不要任何多余文字。'},
            ],
            temperature=0.1,
            max_tokens=64,
            response_format={"type": "json_object"},
            timeout=60.0,
        )
        content = (resp.choices[0].message.content or "").strip()
        print(f"      返回: {content[:200]}")
        print(f"      token 用量: {resp.usage}")
        print("      结果: 通过 ✓")
        return True
    except Exception as e:  # noqa: BLE001 — 自检脚本需要把任何异常都呈现给用户
        print(f"      结果: 失败 ✗\n      {type(e).__name__}: {str(e)[:400]}")
        if "response_format" in str(e) or "json_object" in str(e):
            print("      （提示：该模型不支持 JSON mode。业务代码里 _safe_chat_completion 会自动去掉该参数重试，此处不影响实际使用）")
        return False
    finally:
        print()


async def test_vision(client: AsyncOpenAI, image: Path | None) -> bool:
    print("[2/2] 视觉模型测试")
    print(f"      model = {settings.LLM_MODEL_VISION}")
    if image is None:
        print("      结果: 跳过（未找到样例图，可用 --image 指定一张）")
        print()
        return True
    print(f"      图片  = {image}（{image.stat().st_size} 字节）")
    try:
        b64 = base64.b64encode(image.read_bytes()).decode("utf-8")
        data_url = f"data:image/png;base64,{b64}"
        resp = await client.chat.completions.create(
            model=settings.LLM_MODEL_VISION,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "用一句中文描述这张图片里有什么，30 字以内。"},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            temperature=0.2,
            max_tokens=200,
            timeout=120.0,
        )
        content = (resp.choices[0].message.content or "").strip()
        print(f"      返回: {content[:200]}")
        print(f"      token 用量: {resp.usage}")
        print("      结果: 通过 ✓")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"      结果: 失败 ✗\n      {type(e).__name__}: {str(e)[:400]}")
        return False
    finally:
        print()


async def list_models(client: AsyncOpenAI) -> None:
    print("尝试列出可用模型（兼容端点未必支持该接口，失败属正常）")
    try:
        page = await client.models.list(timeout=30.0)
        ids = sorted(m.id for m in page.data)
        print(f"  共 {len(ids)} 个：")
        for i in ids:
            print(f"    - {i}")
    except Exception as e:  # noqa: BLE001
        print(f"  该端点未提供模型列表：{type(e).__name__}: {str(e)[:200]}")
    print()


async def main() -> int:
    ap = argparse.ArgumentParser(description="千问 API 连通性自检")
    ap.add_argument("--text-only", action="store_true", help="只测文本模型，跳过视觉调用")
    ap.add_argument("--image", help="视觉测试用的图片路径（默认自动找 ../岗位.png）")
    ap.add_argument("--list-models", action="store_true", help="仅查询可用模型列表")
    args = ap.parse_args()

    print_config()

    if not settings.LLM_API_BASE:
        print("✗ LLM_API_BASE 为空，无法继续。请检查 backend/.env。")
        return 2
    if not has_valid_api_key():
        print("✗ LLM_API_KEY 未填写或仍是占位符。")
        print("  → 打开 backend/.env，把这一行改成你的真实 Key：")
        print("      LLM_API_KEY=sk-ws-你的真实Key")
        print("  → Key 获取地址：https://platform.qianwenai.com/home/api-keys")
        return 2

    client = AsyncOpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_API_BASE)

    if args.list_models:
        await list_models(client)
        return 0

    results = [await test_text(client)]
    if not args.text_only:
        results.append(await test_vision(client, pick_image(args.image)))

    print("=" * 68)
    if all(results):
        print("全部通过 ✓  当前配置可以正常调用千问 API。")
        print("提醒：改完 .env 需要**重启后端进程**才会生效（settings 是模块级单例，只在启动时读一次）。")
        return 0
    print("存在失败项 ✗  请按上面的报错逐项排查。常见原因：")
    print("  · Key 无效 / 已删除 / 余额不足（401 / 400）")
    print("  · 模型名不在你的可用范围内（404 / model not found）")
    print("  · 视觉调用报错但文本正常 → 该模型不支持视觉，把 LLM_MODEL_VISION 换成 qwen3-vl-plus 试试")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
