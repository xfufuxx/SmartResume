import os
import sys
import asyncio

# Windows 必须在 uvicorn 启动前设置 ProactorEventLoop，否则 Playwright 无法创建子进程
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    # reload 默认开启（开发期热重载）；用 RELOAD=false 启动可避免 Windows 下
    # reload 进程树被回收导致后端"跑着跑着自己消失"的问题（外部位改 .py 触发）。
    reload_enabled = os.environ.get("RELOAD", "true").lower() not in ("false", "0", "no")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=reload_enabled,
        log_level="info",
    )