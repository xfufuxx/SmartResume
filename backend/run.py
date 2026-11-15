import os
import sys
import asyncio
import logging
import logging.config

# Windows 必须在 uvicorn 启动前设置 ProactorEventLoop，否则 Playwright 无法创建子进程
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn


def _build_logging_config():
    """在 uvicorn 默认日志配置基础上追加一个按天轮转的文件 Handler，
    使后端日志同时落盘到 logs/backend.log，便于随时 tail 与重启后追溯。
    不影响原有控制台输出（uvicorn 默认仍写 stdout）。"""
    cfg = uvicorn.config.LOGGING_CONFIG.copy()
    # 避免 dictConfig 默认禁用已存在的业务 logger（app.* 等）
    cfg["disable_existing_loggers"] = False
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
    os.makedirs(log_dir, exist_ok=True)
    cfg["handlers"]["file"] = {
        "class": "logging.handlers.TimedRotatingFileHandler",
        "filename": os.path.join(log_dir, "backend.log"),
        "when": "midnight",
        "backupCount": 7,
        "encoding": "utf-8",
        "formatter": "default",
    }
    # root：业务 app.* 日志经此落盘
    cfg["root"] = {"handlers": ["default", "file"], "level": "INFO"}
    # uvicorn 各 logger 默认不 propagate 到 root，需逐个追加 file handler
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = cfg["loggers"].setdefault(name, {"level": "INFO", "propagate": False})
        lg["handlers"] = lg.get("handlers", ["default"]) + ["file"]
    return cfg


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
        log_config=_build_logging_config(),
    )
