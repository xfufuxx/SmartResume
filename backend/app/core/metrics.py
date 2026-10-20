"""Prometheus 指标：HTTP 请求 / LLM 调用 / 优化任务。

- /metrics 端点在 main.py 注册；compose 中 backend 端口不对宿主机发布、
  nginx 不反代 /metrics，因此指标端点天然不对外暴露。
- 路径标签取 Starlette 路由模板（/api/optimize/async/{task_id}），
  拿不到路由时归一化为 "unmatched"，防止 task_id 等高基数值打爆标签维度。
"""
import time

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_COUNT = Counter(
    "http_requests_total", "HTTP 请求总数", ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", "HTTP 请求耗时（秒）", ["method", "path"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120),
)
LLM_CALL_COUNT = Counter(
    "llm_calls_total", "LLM 调用总数", ["model", "task", "result"],
)
LLM_LATENCY = Histogram(
    "llm_call_duration_seconds", "LLM 调用耗时（秒）", ["model", "task"],
    buckets=(0.5, 1, 2.5, 5, 10, 20, 40, 80, 160),
)
OPTIMIZE_TASK_COUNT = Counter(
    "optimize_tasks_total", "异步优化任务终态总数", ["status"],
)


def record_llm_call(model: str, task: str, ok: bool, latency_ms: int) -> None:
    LLM_CALL_COUNT.labels(model=model, task=task, result="ok" if ok else "error").inc()
    LLM_LATENCY.labels(model=model, task=task).observe(latency_ms / 1000)


def record_optimize_task(status: str) -> None:
    """只记录终态（completed/failed/cancelled），processing 进度不计数。"""
    if status in ("completed", "failed", "cancelled"):
        OPTIMIZE_TASK_COUNT.labels(status=status).inc()


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


class MetricsMiddleware:
    """纯 ASGI 中间件：统计每个请求的状态码与耗时（按路由模板聚合）。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") == "/metrics":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status_code = 500  # 未收到 response.start（异常中断）时按 500 计

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = scope.get("route")
            path = getattr(route, "path", None) or "unmatched"
            elapsed = time.perf_counter() - started
            REQUEST_COUNT.labels(scope["method"], path, str(status_code)).inc()
            REQUEST_LATENCY.labels(scope["method"], path).observe(elapsed)
