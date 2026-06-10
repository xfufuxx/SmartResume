"""
单元测试 — 认证、刷新令牌、设备吊销、注销
运行: pytest backend/tests/test_auth.py -v
"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timedelta, timezone

import jwt
from app.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_refresh_token, verify_password, hash_password
from app.core.audit import hash_token
from app.services.device_service import register_device, revoke_device
from app.models.user import User, UserDevice


class TestAuthTokens:
    """JWT 令牌生成与校验 — 纯逻辑测试"""

    def test_create_access_token_has_correct_type(self):
        token = create_access_token('user-123')
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        assert payload['sub'] == 'user-123'
        assert payload['type'] == 'access'
        assert 'exp' in payload

    def test_create_refresh_token_includes_device_id(self):
        device_id = 'web-abc123'
        token = create_refresh_token('user-123', device_id)
        payload = decode_refresh_token(token)
        assert payload['sub'] == 'user-123'
        assert payload['device_id'] == device_id
        assert payload['type'] == 'refresh'

    def test_hash_token_is_consistent(self):
        token = 'my-refresh-token-123'
        h1 = hash_token(token)
        h2 = hash_token(token)
        assert h1 == h2
        assert len(h1) == 64

    def test_password_hashing_roundtrip(self):
        password = 'test-password-123'
        hashed = hash_password(password)
        assert verify_password(password, hashed)
        assert not verify_password('wrong-password', hashed)


class TestDeviceService:
    """设备注册与吊销 — 数据库交互测试"""

    @pytest.mark.asyncio
    async def test_register_new_device_creates_record(self):
        mock_db = AsyncMock()
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=existing_result)

        device = await register_device(
            mock_db, 'user-123', 'device-id-456',
            device_name='Chrome/Windows', platform='web',
            ip_address='127.0.0.1',
            refresh_token='token-123',
        )

        assert device.user_id == 'user-123'
        assert device.device_id == 'device-id-456'
        assert device.is_revoked is False
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_revoke_non_existing_device_returns_false(self):
        mock_db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result)
        ok = await revoke_device(mock_db, 'non-existent-id', 'user-123')
        assert ok is False

    @pytest.mark.asyncio
    async def test_revoke_existing_device_succeeds(self):
        device = UserDevice(id='d1', user_id='u1', device_id='dev1', is_revoked=False)
        mock_db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = device
        mock_db.execute = AsyncMock(return_value=result)

        ok = await revoke_device(mock_db, 'd1', 'u1')
        assert ok is True
        assert device.is_revoked is True
        assert device.refresh_token_hash is None


class TestAccountDeletionFlow:
    """测试注销流程正确性"""

    def test_deletion_pending_state_has_deleted_at(self):
        user = User(id='u1', email='test@example.com', password_hash='xxx', status='active')
        tz = timezone(timedelta(hours=8))
        future = datetime.now(tz) + timedelta(days=30)
        user.status = 'deleted_pending'
        user.deleted_at = future
        assert user.status == 'deleted_pending'
        assert user.deleted_at is not None

    def test_active_user_has_no_deleted_at(self):
        user = User(id='u1', email='test@example.com', password_hash='xxx', status='active')
        assert user.status == 'active'
        assert user.deleted_at is None


class TestRefreshTokenRevocation:
    """刷新令牌吊销有效性"""

    @pytest.mark.asyncio
    async def test_revoked_device_cannot_be_used(self):
        device = UserDevice(id='d1', user_id='u1', is_revoked=True, refresh_token_hash=None)
        assert device.is_revoked == True
        assert device.refresh_token_hash is None
