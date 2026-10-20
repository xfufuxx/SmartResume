"""把 llm_policy 里的免费额度模型灌进 model_routing 表，激活模型路由链路。

背景
----
`app/services/model_router.py` 的 `route_model()` 虽然实现了权重路由 / 限流 / 熔断，
但全项目没有任何调用点，`model_routing` 表也是空的 —— 所谓「免费用户走免费模型」的
分层从来没生效过。本脚本负责把这条链路激活（可重复执行，按 model_name 幂等 upsert）。

用法（在 backend/ 目录下）：
    ./.venv/Scripts/python.exe seed_model_routing.py            # 灌入免费额度模型
    ./.venv/Scripts/python.exe seed_model_routing.py --list     # 只看会灌什么
    ./.venv/Scripts/python.exe seed_model_routing.py --force    # 清空表后重建
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.database import async_session_factory
from app.models.admin import ModelRouting
from app.services.model_router import build_routing_rows, _is_billing_acceptable


async def list_planned() -> None:
    rows = build_routing_rows()
    print(f"将灌入 {len(rows)} 条模型路由：")
    for r in rows:
        flag = "可用" if _is_billing_acceptable(r["model_name"]) else "被计费策略排除"
        weight = r["weight"]
        print(f"  [{flag}] {r['model_name']:<24} weight={weight} tier={r['tier']}")


async def seed(force: bool = False) -> int:
    rows = build_routing_rows()
    if not rows:
        print("没有可灌入的免费额度模型（llm_policy 清单为空或全部过期）。")
        return 0

    async with async_session_factory() as db:
        if force:
            existing = (await db.execute(select(ModelRouting))).scalars().all()
            for obj in existing:
                await db.delete(obj)
            await db.flush()
            print(f"已清空原有 {len(existing)} 条记录")

        for row in rows:
            res = await db.execute(
                select(ModelRouting).where(ModelRouting.model_name == row["model_name"])
            )
            obj = res.scalar_one_or_none()
            if obj:
                # 已存在则更新可选项（幂等）
                obj.display_name = row["display_name"]
                obj.weight = row["weight"]
                obj.rate_limit_per_minute = row["rate_limit_per_minute"]
                obj.rate_limit_per_hour = row["rate_limit_per_hour"]
                obj.is_enabled = True
                print(f"  [更新] {row['model_name']}")
            else:
                db.add(ModelRouting(**row))
                print(f"  [新增] {row['model_name']}")
        await db.commit()

    print(f"完成：model_routing 现有 {len(rows)} 个免费额度模型可用。")
    return len(rows)


async def main() -> int:
    args = set(sys.argv[1:])
    if "--list" in args:
        await list_planned()
        return 0
    return await seed(force="--force" in args)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
