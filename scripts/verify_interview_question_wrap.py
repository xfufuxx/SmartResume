"""兼容入口：面试题长文本换行校验。

改造为对话式「模拟押题」后，题目不再是 antd Card 标题（旧脚本断言的
`.iq-question-card .ant-card-head-title` 已不存在），长题换行断言并入
`verify_mock_interview.py`（旧版会话回放里对 `.mock-q-text` 做横向溢出检查）。

保留本文件名，旧的运行方式继续可用；--no-live 只跑 UI/回放，不触发真实 LLM。
"""
import subprocess
import sys
from pathlib import Path

TARGET = Path(__file__).with_name("verify_mock_interview.py")

if __name__ == "__main__":
    print(f"[提示] 长题换行已并入 {TARGET.name}，本次运行其 --no-live 模式。")
    sys.exit(subprocess.call([sys.executable, str(TARGET), "--no-live"]))
