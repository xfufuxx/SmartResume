"""LLM 403 额度耗尽修复的链路级验证（离线，不发起真实上游请求）。

背景：用户实测报错
  「优化失败: Error code: 403 - {'error': {'message': 'Free quota exhausted. ...'}}」
根因：llm_policy（免费额度清单/自动降级/付费拦截）已写好但从未接进主链路，
且重试循环对 403 这种确定性错误也一视同仁地重试 3 次。

本脚本把百炼 403 原文从 mock client 灌进主链路，验证六件事：
  V1 自动降级：显式用已过期的 qwen3.7-flash → 请求实际发到免费期内替补
  V2 配置无关：无论 .env 配什么模型，发出的必须仍在免费期内
  V3 403 不重试：一次性失败（且持续失败）都只发 1 次请求
  V4 中文异常：抛 LLMQuotaExhausted，文案含百炼控制台与三种处理方式
  V5 可重试路径未破坏：429 仍按指数退避重试，重试成功能返回
  V6 text_optimizer 批处理对额度耗竭必须上抛，不静默保留原文

运行：cd backend && ../.venv/Scripts/python.exe ../scripts/verify_llm_403_policy.py
"""

import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.config import settings  # noqa: E402
from app.core.llm_errors import LLMQuotaExhausted  # noqa: E402
from app.core.llm_policy import billing_info, resolve_model  # noqa: E402
from app.services.agent_optimizer import _call_with_retry  # noqa: E402
from app.services import text_optimizer  # noqa: E402
from app.services.pdf_layout_editor import TextBlock  # noqa: E402

# 已过期的模型（额度 2026-10-23 到期，控制台已下架）——强制走降级路径，
# 不依赖 .env 当前配置（.env 已换成 qwen3.8-flash，本身在免费期内不会触发降级）
EXPIRED_MODEL = "qwen3.7-flash"

# 用户实测收到的百炼 403 原文
BAILIAN_403 = (
    "Error code: 403 - {'error': {'message': 'Free quota exhausted. To continue "
    "accessing the model on a paid basis, please add funds or disable the \"use "
    'free tier only" mode in the management console.\', \'code\': '
    "'AllocationQuota.FreeTierOnly', 'request_id': 'fake-req-id'}}"
)

PASS = FAIL = 0


def check(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {detail}")


class FakeCompletions:
    """记录调用次数/入参，并按脚本抛出指定异常。"""

    def __init__(self, behaviors):
        self.behaviors = list(behaviors)  # 每次调用消费一个；耗尽后重复最后一个
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        b = self.behaviors[min(len(self.calls) - 1, len(self.behaviors) - 1)]
        if isinstance(b, BaseException):
            raise b
        return b


class FakeClient:
    def __init__(self, behaviors):
        self.chat = type("C", (), {"completions": FakeCompletions(behaviors)})()


class FakeResp:
    """足够 _call_with_retry 返回链使用的替身响应。"""

    choices = [type("M", (), {"message": type("X", (), {"content": "{}"})()})()]


async def v1_v2_v3_quota_and_retry():
    print("V1-V4 403 降级 / 配置无关 / 不重试 / 中文异常")
    client = FakeClient([Exception(BAILIAN_403)])
    try:
        await _call_with_retry(
            client, task="简历优化",
            model=EXPIRED_MODEL,
            messages=[{"role": "user", "content": "x"}],
        )
        check("403 时应抛异常", False, "竟然返回了")
    except LLMQuotaExhausted as e:
        msg = str(e)
        check("403 抛 LLMQuotaExhausted", True)
        check("文案中文且含控制台地址", "bailian.console.aliyun.com" in msg, msg)
        check("文案含处理方式(ALLOW_PAID/换Key/控制台)",
              "LLM_ALLOW_PAID=true" in msg and "LLM_API_KEY" in msg)
    except Exception as e:  # noqa: BLE001
        check("403 抛 LLMQuotaExhausted", False, f"实际 {type(e).__name__}: {e}")

    calls = client.chat.completions.calls
    check("403 只发 1 次请求（不重试）", len(calls) == 1, f"实际 {len(calls)} 次")

    sent_model = calls[0]["model"] if calls else ""
    resolved, note = resolve_model(EXPIRED_MODEL)
    check("过期模型被降级到免费期内替补",
          sent_model == resolved and sent_model != EXPIRED_MODEL and "到期" in note,
          f"sent={sent_model} resolved={resolved} note={note!r}")

    # V2 配置无关：.env 当前配置的模型，发出的必须仍在免费期内
    client_b = FakeClient([FakeResp()])
    await _call_with_retry(
        client_b, task="配置核查", model=settings.LLM_MODEL_TEXT,
        messages=[{"role": "user", "content": "x"}],
    )
    sent_b = client_b.chat.completions.calls[0]["model"]
    info = billing_info(sent_b)
    still_free = info["has_free_quota"] and (not info["expiry"] or info["expiry"] >= date.today())
    check("当前配置(.env)发出的模型仍在免费期内", still_free,
          f"LLM_MODEL_TEXT={settings.LLM_MODEL_TEXT} sent={sent_b} info={info}")

    # V3 持续 403：依然只发 1 次（防止未来有人把 is_retryable 判断改坏）
    client2 = FakeClient([Exception(BAILIAN_403)] * 10)
    try:
        await _call_with_retry(client2, task="匹配分析", model=EXPIRED_MODEL,
                               messages=[{"role": "user", "content": "x"}])
    except Exception:  # noqa: BLE001
        pass
    check("持续 403 仍只发 1 次", len(client2.chat.completions.calls) == 1,
          f"实际 {len(client2.chat.completions.calls)} 次")


async def v4_retryable_still_retries():
    print("V5 可重试路径未破坏（429 → 重试 → 成功）")
    err429 = Exception("Error code: 429 - {'error': {'message': 'rate limit exceeded'}}")
    client = FakeClient([err429, err429, FakeResp()])
    resp = await _call_with_retry(
        client, task="简历优化", model=settings.LLM_MODEL_TEXT,
        messages=[{"role": "user", "content": "x"}],
    )
    check("429 重试后成功返回", resp is client.chat.completions.behaviors[-1])
    check("429 共发 3 次（重试链路完好）", len(client.chat.completions.calls) == 3,
          f"实际 {len(client.chat.completions.calls)} 次")


async def v5_batch_reraises_quota():
    print("V6 text_optimizer 批处理：额度耗竭必须上抛")

    async def boom(*args, **kwargs):
        raise LLMQuotaExhausted("AI 服务免费额度已耗尽……")

    orig = text_optimizer._call_llm_optimize
    text_optimizer._call_llm_optimize = boom
    try:
        blocks = [
            TextBlock(text="原始内容A", bbox=(0, 0, 10, 10), block_index=0),
            TextBlock(text="原始内容B", bbox=(0, 10, 10, 20), block_index=1),
        ]
        try:
            await text_optimizer.optimize_text_blocks(blocks, {"title": "x"})
            check("批处理应上抛 LLMQuotaExhausted", False, "竟然返回了（静默保留原文=假成功）")
        except LLMQuotaExhausted:
            check("批处理上抛 LLMQuotaExhausted", True)
        except Exception as e:  # noqa: BLE001
            check("批处理应上抛 LLMQuotaExhausted", False, f"实际 {type(e).__name__}")
    finally:
        text_optimizer._call_llm_optimize = orig


async def main():
    print(f"LLM_MODEL_TEXT={settings.LLM_MODEL_TEXT} "
          f"LLM_AUTO_FALLBACK={getattr(settings, 'LLM_AUTO_FALLBACK', None)} "
          f"LLM_ALLOW_PAID={getattr(settings, 'LLM_ALLOW_PAID', None)}")
    await v1_v2_v3_quota_and_retry()
    await v4_retryable_still_retries()
    await v5_batch_reraises_quota()
    print(f"\n结果: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
