"""个人数据洞察：把仪表盘从「写死示例」换成基于真实数据的统计。

对外只暴露一个聚合接口 GET /api/insights/overview，一次请求返回首页所需的全部数据，
避免首页并发打 5~6 个接口造成的瀑布式加载。
"""
import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, Message
from app.models.resume import Resume
from app.models.job_image import JobImage
from app.models.optimized_resume import OptimizedResume

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["Insights"])
TZ_UTC8 = timezone(timedelta(hours=8))


def _to_cst(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc).astimezone(TZ_UTC8)
    return dt.astimezone(TZ_UTC8)


def _fmt_day(dt: datetime) -> str:
    return dt.strftime("%m-%d")


@router.get("/overview")
async def overview(
    days: int = Query(30, ge=7, le=180, description="趋势统计窗口天数"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    uid = user.id

    resumes = (
        await db.execute(
            select(Resume)
            .where(Resume.user_id == uid, Resume.deleted_at.is_(None))
            .order_by(Resume.created_at.desc())
        )
    ).scalars().all()

    jobs = (
        await db.execute(
            select(JobImage)
            .where(JobImage.user_id == uid, JobImage.deleted_at.is_(None))
            .order_by(JobImage.created_at.desc())
        )
    ).scalars().all()

    opts = (
        await db.execute(
            select(OptimizedResume)
            .where(OptimizedResume.user_id == uid, OptimizedResume.deleted_at.is_(None))
            .order_by(OptimizedResume.created_at.desc())
        )
    ).scalars().all()

    # ── 基础计数 ──
    unparsed_resumes = sum(1 for r in resumes if not r.parsed_json)
    unparsed_jobs = sum(1 for j in jobs if not j.parsed_job_json)
    favorite_opts = sum(1 for o in opts if o.is_favorite)

    counts = {
        "resumes": len(resumes),
        "jobs": len(jobs),
        "optimizations": len(opts),
        "favorites": favorite_opts,
        "unparsed_resumes": unparsed_resumes,
        "unparsed_jobs": unparsed_jobs,
    }

    # ── 匹配度 ──
    scored = [o for o in opts if o.match_score is not None]
    scores = [o.match_score for o in scored]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0
    best_score = max(scores) if scores else 0
    latest_score = scored[0].match_score if scored else 0

    # 提升幅度：最近一条 vs 最早一条（同一用户优化效果的纵向对比）
    improvement = 0
    if len(scored) >= 2:
        improvement = round(scored[0].match_score - scored[-1].match_score, 1)

    # ── 趋势（按天聚合）──
    now_cst = datetime.now(TZ_UTC8)
    start_date = (now_cst - timedelta(days=days - 1)).date()
    buckets: dict[str, dict] = {}
    for i in range(days):
        d = start_date + timedelta(days=i)
        buckets[d.strftime("%m-%d")] = {"date": d.strftime("%m-%d"), "count": 0, "avg_score": None}

    per_day: dict[str, list[int]] = defaultdict(list)
    for o in scored:
        cst = _to_cst(o.created_at)
        if not cst:
            continue
        key = _fmt_day(cst)
        if key in buckets:
            per_day[key].append(o.match_score)
    for o in opts:
        cst = _to_cst(o.created_at)
        if not cst:
            continue
        key = _fmt_day(cst)
        if key in buckets:
            buckets[key]["count"] += 1
    for key, vals in per_day.items():
        buckets[key]["avg_score"] = round(sum(vals) / len(vals), 1)

    trend = [buckets[k] for k in sorted(buckets.keys())]

    # ── 分类分布（按优化记录）──
    cat_counter: dict[str, int] = defaultdict(int)
    for o in opts:
        cat_counter[o.category or "其他"] += 1
    categories = [
        {"name": k, "value": v}
        for k, v in sorted(cat_counter.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # ── 最近动态（统一时间线）──
    activities: list[dict] = []
    for r in resumes[:10]:
        activities.append({
            "type": "resume",
            "title": r.title or "未命名简历",
            "desc": "上传了简历" + ("" if r.parsed_json else "（解析中）"),
            "match_score": r.match_rate,
            "created_at": _to_cst(r.created_at).isoformat() if r.created_at else None,
        })
    for j in jobs[:10]:
        activities.append({
            "type": "job",
            "title": j.title or (j.parsed_job_json or {}).get("title") or "未命名岗位",
            "desc": ("@ " + j.company) if j.company else "录入了目标岗位",
            "match_score": None,
            "created_at": _to_cst(j.created_at).isoformat() if j.created_at else None,
        })
    for o in opts[:10]:
        activities.append({
            "type": "optimize",
            "title": o.job_title or "优化记录",
            "desc": ("@ " + o.company) if o.company else "完成了一次 AI 优化",
            "match_score": o.match_score,
            "ref_id": o.id,
            "created_at": _to_cst(o.created_at).isoformat() if o.created_at else None,
        })
    activities = [a for a in activities if a.get("created_at")]
    activities.sort(key=lambda a: a["created_at"], reverse=True)
    activities = activities[:8]

    # ── 待办建议（基于真实数据推导，不再写死）──
    action_items: list[dict] = []
    if not resumes:
        action_items.append({
            "level": "warning", "title": "还没有上传简历",
            "desc": "上传一份 PDF / DOCX 简历，系统会自动解析出经历与技能，之后所有功能都可以基于它工作。",
            "action": "去上传", "link": "/resumes",
        })
    elif unparsed_resumes:
        action_items.append({
            "level": "warning", "title": f"{unparsed_resumes} 份简历尚未解析完成",
            "desc": "解析失败通常是扫描件或图片型 PDF，可重新上传文字版以获得更好的优化效果。",
            "action": "去处理", "link": "/resumes",
        })
    if not jobs:
        action_items.append({
            "level": "info", "title": "还没有录入目标岗位",
            "desc": "上传招聘截图后，AI 会提取岗位要求，简历优化和匹配度分析才有参照物。",
            "action": "去录入", "link": "/jobs",
        })
    if resumes and jobs and not opts:
        action_items.append({
            "level": "primary", "title": "可以做第一次优化了",
            "desc": "简历与岗位都准备好了，一键生成针对该岗位的定制版简历。",
            "action": "去优化", "link": "/",
        })

    weak = [o for o in scored if o.match_score < 70]
    if weak:
        worst = min(weak, key=lambda o: o.match_score)
        action_items.append({
            "level": "warning", "title": f"「{worst.job_title or '该岗位'}」匹配度只有 {worst.match_score} 分",
            "desc": "低于 70 分的简历很容易在初筛被淘汰，建议补充岗位关键词后重新优化。",
            "action": "去优化", "link": "/",
        })
    unrated = [o for o in opts if o.satisfaction_score is None]
    if len(unrated) >= 3:
        action_items.append({
            "level": "info", "title": f"{len(unrated)} 条优化结果还没打分",
            "desc": "你的满意度评分会帮助系统判断哪些改写策略更有效。",
            "action": "去评价", "link": "/history",
        })
    latest_opt_at = _to_cst(opts[0].created_at) if opts else None
    if latest_opt_at and (now_cst - latest_opt_at).days >= 14:
        action_items.append({
            "level": "info", "title": f"已经 {(now_cst - latest_opt_at).days} 天没有优化简历了",
            "desc": "岗位要求在持续变化，建议每隔一段时间重新做一次匹配分析。",
            "action": "去看看", "link": "/match",
        })
    if resumes and jobs:
        action_items.append({
            "level": "primary", "title": "还没做过 ATS 体检？",
            "desc": "用规则引擎检查简历的机器可读性，避免因排版、缺失模块被筛选系统漏掉。",
            "action": "去体检", "link": "/ats",
        })

    # ── 未读消息数（顶部铃铛红点用真实值）──
    unread_result = await db.execute(
        select(func.count(Message.id)).where(Message.user_id == uid, Message.is_read == False)  # noqa: E712
    )
    unread_messages = int(unread_result.scalar() or 0)

    return {
        "counts": counts,
        "match": {
            "avg": avg_score,
            "best": best_score,
            "latest": latest_score,
            "improvement": improvement,
            "sample_size": len(scores),
        },
        "trend": trend,
        "categories": categories,
        "recent_activities": activities,
        "action_items": action_items,
        "unread_messages": unread_messages,
        "generated_at": now_cst.isoformat(),
    }
