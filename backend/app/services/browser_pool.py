"""
Playwright Chromium 常驻池。

问题
----
历史上 ``html_to_pdf_async`` 每次调用都 ``async_playwright()`` + ``chromium.launch()``
+ ``close()``：launch 是纯开销（本机实测 0.6-1.5s），批量优化（最多 5 个任务）、
连续重导出、E2E 全量跑时这笔成本被反复支付，单次导出延迟高、CPU/内存出现尖峰。

做法
----
- 进程内**单个** playwright + browser 常驻，首次使用时懒启动；
- 每次渲染只开一个 ``context``（隔离 cookie/缓存/storage），用完关 context；
- ``Semaphore`` 限制并发渲染数（默认 3，``BROWSER_MAX_CONCURRENCY`` 可调），避免
  低配 ECS 上同时开十几个页面把内存打爆；
- browser 掉线（is_connected 为 False）或进程换了事件循环 → 自动重建；
- 池不可用时调用方回退到「一次性 launch」，池化失败不能变成新的失败模式。

注意（Windows）：常驻的是 **async** API 的 browser，sync API 仍按原样一次性使用——
``sync_playwright`` 在非主线程会触发 NotImplementedError，且不能与 async 版共享实例。
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

logger = logging.getLogger(__name__)

_LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"]

#: 池状态（模块级单例）
_playwright = None
_browser = None
_loop: asyncio.AbstractEventLoop | None = None
_playwright_lock: asyncio.Lock | None = None
_lock_loop: asyncio.AbstractEventLoop | None = None
_semaphore: asyncio.Semaphore | None = None

#: 诊断计数：启动次数 / 复用次数（供日志与性能对比）
_stats = {"launches": 0, "reuses": 0, "contexts": 0}


def _max_concurrency() -> int:
    try:
        value = int(os.getenv("BROWSER_MAX_CONCURRENCY", "3"))
        return max(1, value)
    except ValueError:
        return 3


def _get_lock() -> asyncio.Lock:
    """按事件循环隔离的锁（uvicorn 多 worker 是独立进程；同进程换 loop 时重建）。"""
    global _playwright_lock, _lock_loop
    loop = asyncio.get_running_loop()
    if _playwright_lock is None or _lock_loop is not loop:
        _playwright_lock = asyncio.Lock()
        _lock_loop = loop
    return _playwright_lock


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(_max_concurrency())
    return _semaphore


async def _dispose_locked() -> None:
    """关闭 browser 与 playwright（调用方需持有 lock）。"""
    global _playwright, _browser, _loop, _semaphore
    if _browser is not None:
        try:
            await _browser.close()
        except Exception:  # noqa: BLE001 —— 关闭失败不应影响后续重建
            logger.debug("[浏览器池] browser.close 失败", exc_info=True)
    if _playwright is not None:
        try:
            await _playwright.stop()
        except Exception:  # noqa: BLE001
            logger.debug("[浏览器池] playwright.stop 失败", exc_info=True)
    _playwright = None
    _browser = None
    _loop = None
    _semaphore = None


async def _ensure_browser():
    """取常驻 browser（必要时懒启动 / 重建）。"""
    global _playwright, _browser, _loop

    loop = asyncio.get_running_loop()
    if _browser is not None and _browser.is_connected() and _loop is loop:
        _stats["reuses"] += 1
        return _browser

    async with _get_lock():
        # 双检：可能在排队期间已被别的任务拉起
        if _browser is not None and _browser.is_connected() and _loop is loop:
            _stats["reuses"] += 1
            return _browser

        if _browser is not None or _playwright is not None:
            logger.info("[浏览器池] 检测到掉线或事件循环变更，重建 browser")
            await _dispose_locked()

        from playwright.async_api import async_playwright

        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(headless=True, args=_LAUNCH_ARGS)
        _loop = loop
        _stats["launches"] += 1
        logger.info(
            "[浏览器池] browser 已启动（launches=%s, 并发上限=%s）",
            _stats["launches"], _max_concurrency(),
        )
        return _browser


class BrowserPoolUnavailable(RuntimeError):
    """常驻池拿不到 page（启动失败/依赖缺失/事件循环异常）——调用方应回退一次性启动。"""


@asynccontextmanager
async def browser_page() -> AsyncIterator:
    """借一个隔离 context 下的 page（用完自动关闭 context）。

    只有**获取阶段**的失败会转成 :class:`BrowserPoolUnavailable`；渲染阶段抛出的异常
    原样上抛，避免调用方把「渲染出错」误判成「池不可用」而重复渲染一次。
    """
    sem = _get_semaphore()
    try:
        await sem.acquire()
        browser = await _ensure_browser()
        context = await browser.new_context()
    except Exception as exc:  # noqa: BLE001 —— 统一转成可识别的池不可用
        sem.release()
        raise BrowserPoolUnavailable(f"{type(exc).__name__}: {exc}") from exc

    _stats["contexts"] += 1
    try:
        page = await context.new_page()
        yield page
    finally:
        try:
            await context.close()
        except Exception:  # noqa: BLE001 —— context 关闭失败不阻断主流程
            logger.debug("[浏览器池] context.close 失败", exc_info=True)
        sem.release()


async def shutdown_browser() -> None:
    """应用退出时收尾（FastAPI lifespan）。"""
    async with _get_lock():
        if _browser is not None or _playwright is not None:
            await _dispose_locked()
            logger.info("[浏览器池] 已释放（%s）", get_stats())


def get_stats() -> dict:
    """诊断快照：启动/复用次数、是否常驻。"""
    return {
        **_stats,
        "running": _browser is not None and bool(_browser.is_connected()),
        "max_concurrency": _max_concurrency(),
    }
