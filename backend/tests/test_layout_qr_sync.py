"""排版二维码同步单测：画布里的 qrcode 块 ↔ optimized_json['qr_code']。

排版模式是绝对定位画布，二维码只能作为独立块存在；模板导出读的是
optimized_json['qr_code']。两条链路数据源不同，不打通就会出现
「排版里有、模板导出没有」的分裂——本文件守住这条同步。
"""

import pytest

from app.api.optimization import _sync_qr_code_from_layout

_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


class _Rec:
    """最小记录替身：同步函数只碰 optimized_json"""

    def __init__(self, data=None):
        self.optimized_json = data


def _layout(blocks):
    return {"version": 1, "canvas": {"width": 210, "height": 297}, "blocks": blocks}


def _qr_block(payload, visible=True):
    b = {
        "id": "blk_qrcode",
        "type": "qrcode",
        "rect": {"x": 15, "y": 200, "w": 180, "h": 24},
        "contentRef": {"source": "qr_code", "payload": payload},
    }
    if not visible:
        b["visible"] = False
    return b


def test_sync_writes_qr_code_from_block():
    rec = _Rec({"summary": "x"})
    _sync_qr_code_from_layout(
        rec, _layout([_qr_block({"image": _PNG, "label": "Java 后端", "url": "https://a.example.com"})])
    )
    assert rec.optimized_json["qr_code"]["image"] == _PNG
    assert rec.optimized_json["qr_code"]["label"] == "Java 后端"
    assert rec.optimized_json["summary"] == "x"


def test_sync_clears_when_no_qr_block():
    """用户在画布里删了二维码 → 模板导出也不该再有（画布即真相）"""
    rec = _Rec({"summary": "x", "qr_code": {"image": _PNG}})
    _sync_qr_code_from_layout(rec, _layout([{"id": "a", "type": "text"}]))
    assert "qr_code" not in rec.optimized_json


def test_sync_ignores_hidden_block():
    rec = _Rec({"qr_code": {"image": _PNG}})
    _sync_qr_code_from_layout(rec, _layout([_qr_block({"image": _PNG}, visible=False)]))
    assert "qr_code" not in rec.optimized_json


def test_sync_invalid_payload_keeps_data_and_no_raise():
    """坏数据（非 data URL）只跳过，绝不阻断保存/导出"""
    rec = _Rec({"qr_code": {"image": _PNG}})
    _sync_qr_code_from_layout(rec, _layout([_qr_block({"image": "https://evil.example.com/q.png"})]))
    assert rec.optimized_json["qr_code"]["image"] == _PNG


def test_sync_non_dict_payload_clears():
    rec = _Rec({"qr_code": {"image": _PNG}})
    _sync_qr_code_from_layout(rec, _layout([_qr_block("not-a-dict")]))
    assert "qr_code" not in rec.optimized_json


def test_sync_malformed_layout_noop():
    rec = _Rec({"qr_code": {"image": _PNG}})
    for bad in (None, {}, {"blocks": "nope"}, "x"):
        before = dict(rec.optimized_json)
        _sync_qr_code_from_layout(rec, bad)
        assert rec.optimized_json == before


@pytest.mark.parametrize("empty", [{}, {"image": "   "}])
def test_sync_empty_payload_clears(empty):
    rec = _Rec({"qr_code": {"image": _PNG}})
    _sync_qr_code_from_layout(rec, _layout([_qr_block(empty)]))
    assert "qr_code" not in rec.optimized_json
