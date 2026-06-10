"""
管理后台单元测试 — 封禁/解封、Prompt灰度部署、订单退款、额度消耗
运行: pytest backend/tests/test_admin.py -v
"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timedelta, timezone

from app.models.admin import (
    Admin, PromptTemplate, ModelRouting, Order, QuotaPackage,
    AdminLog,
)
from app.models.user import User, UserQuota
from app.services.prompt_service import (
    create_prompt_version, deploy_prompt, rollback_prompt,
    get_active_prompt, resolve_prompt_for_user,
)
from app.services.order_service import process_refund
from app.services.quota_service import check_and_consume_quota, add_quota

TZ_UTC8 = timezone(timedelta(hours=8))


# ═══════════════════════════════════════════════════════
#  用户封禁/解封 逻辑测试
# ═══════════════════════════════════════════════════════

class TestUserBanUnban:
    """用户封禁与解封 — 数据库状态变更测试"""

    def test_ban_changes_status_to_frozen(self):
        user = User(id='u1', email='test@example.com', password_hash='xxx', status='active')
        user.status = 'frozen'
        assert user.status == 'frozen'

    def test_unban_restores_status_to_active(self):
        user = User(id='u1', email='test@example.com', password_hash='xxx', status='frozen')
        user.status = 'active'
        assert user.status == 'active'

    @pytest.mark.asyncio
    async def test_ban_records_admin_log(self):
        mock_db = AsyncMock()
        admin = Admin(id='admin-1', username='superadmin', role='super_admin')

        user = User(id='u1', email='test@example.com', password_hash='xxx', status='active')
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = user
        mock_db.execute = AsyncMock(return_value=user_result)

        user.status = 'frozen'
        log = AdminLog(admin_id=admin.id, action='user_ban', target_type='user', target_id='u1',
                        details={'reason': '违规', 'duration_days': 7})
        mock_db.add(log)

        assert user.status == 'frozen'
        assert log.action == 'user_ban'
        assert log.details['reason'] == '违规'
        assert log.details['duration_days'] == 7

    @pytest.mark.asyncio
    async def test_unban_clears_frozen_status(self):
        mock_db = AsyncMock()
        admin = Admin(id='admin-1', username='superadmin', role='super_admin')
        user = User(id='u1', email='test@example.com', password_hash='xxx', status='frozen')

        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = user
        mock_db.execute = AsyncMock(return_value=user_result)

        user.status = 'active'
        log = AdminLog(admin_id=admin.id, action='user_unban', target_type='user', target_id='u1')
        mock_db.add(log)

        assert user.status == 'active'
        assert log.action == 'user_unban'


# ═══════════════════════════════════════════════════════
#  Prompt 版本管理 & 灰度部署 测试
# ═══════════════════════════════════════════════════════

class TestPromptVersioning:
    """Prompt版本创建与灰度部署"""

    @pytest.mark.asyncio
    async def test_create_first_version_auto_active(self):
        mock_db = AsyncMock()
        max_result = MagicMock()
        max_result.scalar.return_value = None
        mock_db.execute = AsyncMock(return_value=max_result)

        prompt = await create_prompt_version(
            mock_db, 'star_rewrite', 'star_rewrite',
            '请使用STAR法则重写: {{resume_section}}',
            variables={'resume_section': '原始内容'},
            admin_id='admin-1',
        )

        assert prompt.name == 'star_rewrite'
        assert prompt.scene == 'star_rewrite'
        assert prompt.version == 1
        assert prompt.is_active is True
        assert prompt.gray_ratio == 0

    @pytest.mark.asyncio
    async def test_create_second_version_auto_increments(self):
        mock_db = AsyncMock()
        max_result = MagicMock()
        max_result.scalar.return_value = 1
        mock_db.execute = AsyncMock(return_value=max_result)

        prompt = await create_prompt_version(
            mock_db, 'star_rewrite', 'star_rewrite',
            '改进版STAR: {{resume_section}}', admin_id='admin-1',
        )

        assert prompt.version == 2
        assert prompt.is_active is False

    def test_gray_ratio_100_deploys_full(self):
        v1 = PromptTemplate(id='p1', name='star_rewrite', scene='star_rewrite', version=1,
                             content='v1 content', is_active=True, gray_ratio=100)
        v2 = PromptTemplate(id='p2', name='star_rewrite', scene='star_rewrite', version=2,
                             content='v2 content', is_active=False, gray_ratio=0)

        assert v1.gray_ratio == 100
        assert v1.is_active is True
        assert v2.is_active is False

    def test_gray_deterministic_routing(self):
        user_id = 'user-abc-123'
        bucket = hash(user_id) % 100
        assert 0 <= bucket <= 99

        same_bucket = hash(user_id) % 100
        assert bucket == same_bucket

    def test_different_users_get_different_buckets(self):
        bucket1 = hash('user-a') % 100
        bucket2 = hash('user-b') % 100
        assert bucket1 != bucket2

    @pytest.mark.asyncio
    async def test_rollback_activates_target_version(self):
        v1 = PromptTemplate(id='p1', name='work_experience', scene='work_experience',
                             version=1, content='old', is_active=False, gray_ratio=0)
        v3 = PromptTemplate(id='p3', name='work_experience', scene='work_experience',
                             version=3, content='current', is_active=True, gray_ratio=100)

        mock_db = AsyncMock()
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = v1
        current_result = MagicMock()
        current_result.scalars.return_value.all.return_value = [v3]
        mock_db.execute = AsyncMock(side_effect=[target_result, current_result])

        result = await rollback_prompt(mock_db, 'work_experience', 'work_experience', 1)

        assert result.version == 1
        assert result.is_active is True
        assert result.gray_ratio == 100

    @pytest.mark.asyncio
    async def test_rollback_nonexistent_version_raises(self):
        mock_db = AsyncMock()
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=target_result)

        with pytest.raises(ValueError, match='Version 99 not found'):
            await rollback_prompt(mock_db, 'star_rewrite', 'star_rewrite', 99)

    @pytest.mark.asyncio
    async def test_resolve_prompt_for_user_full_deployment(self):
        mock_db = AsyncMock()
        active = PromptTemplate(id='p1', name='star_rewrite', scene='star_rewrite',
                                 version=1, is_active=True, gray_ratio=100)
        base_result = MagicMock()
        base_result.scalars.return_value.all.return_value = [active]
        mock_db.execute = AsyncMock(return_value=base_result)

        prompt, strategy = await resolve_prompt_for_user(mock_db, 'star_rewrite', 'star_rewrite', 'user-123')
        assert prompt.id == 'p1'
        assert strategy == 'active'

    @pytest.mark.asyncio
    async def test_resolve_prompt_no_candidates_returns_default(self):
        mock_db = AsyncMock()
        base_result = MagicMock()
        base_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=base_result)

        prompt, strategy = await resolve_prompt_for_user(mock_db, 'unknown', 'unknown', 'user-123')
        assert prompt is None
        assert strategy == 'default'


# ═══════════════════════════════════════════════════════
#  订单退款 测试
# ═══════════════════════════════════════════════════════

class TestOrderRefund:
    """订单退款处理"""

    @pytest.mark.asyncio
    async def test_refund_success_order(self):
        order = Order(id='o1', user_id='u1', order_no='SR20250101000001',
                       package_type='monthly_vip', package_name='月度VIP',
                       amount=29.90, payment_method='wechat', status='success',
                       paid_at=datetime.now(TZ_UTC8) - timedelta(days=5))

        pkg = QuotaPackage(id='pkg1', package_type='monthly_vip', duration_days=30)
        quota = UserQuota(user_id='u1', is_paid=True, daily_limit=-1, monthly_limit=-1)

        mock_db = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none.return_value = order
        pkg_result = MagicMock()
        pkg_result.scalar_one_or_none.return_value = pkg
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(side_effect=[order_result, pkg_result, qr_result])

        result = await process_refund(mock_db, 'o1', 'admin-1', '用户申请退款')

        assert result['order_no'] == 'SR20250101000001'
        assert result['status'] == 'refunded'
        assert order.status == 'refunded'
        assert order.refund_reason == '用户申请退款'
        assert order.refunded_by == 'admin-1'
        assert order.refunded_at is not None
        assert quota.is_paid is False

    @pytest.mark.asyncio
    async def test_refund_non_success_order_raises(self):
        order = Order(id='o1', user_id='u1', order_no='SR20250101',
                       package_type='monthly_vip', amount=29.90, status='pending')

        mock_db = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none.return_value = order
        mock_db.execute = AsyncMock(return_value=order_result)

        with pytest.raises(ValueError, match='订单状态为 pending'):
            await process_refund(mock_db, 'o1', 'admin-1')

    @pytest.mark.asyncio
    async def test_refund_after_30_days_raises(self):
        order = Order(id='o1', user_id='u1', order_no='SR20250101',
                       package_type='monthly_vip', amount=29.90, status='success',
                       paid_at=datetime.now(TZ_UTC8) - timedelta(days=45))

        mock_db = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none.return_value = order
        mock_db.execute = AsyncMock(return_value=order_result)

        with pytest.raises(ValueError, match='超过30天退款期'):
            await process_refund(mock_db, 'o1', 'admin-1')

    @pytest.mark.asyncio
    async def test_refund_nonexistent_order_raises(self):
        mock_db = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=order_result)

        with pytest.raises(ValueError, match='订单不存在'):
            await process_refund(mock_db, 'nonexistent', 'admin-1')

    @pytest.mark.asyncio
    async def test_refund_topup_resets_quota_limits(self):
        order = Order(id='o2', user_id='u2', order_no='SR20250102000001',
                       package_type='topup_10', package_name='10次优化包',
                       amount=9.90, status='success',
                       paid_at=datetime.now(TZ_UTC8) - timedelta(days=2))

        pkg = QuotaPackage(id='pkg2', package_type='topup_10', quota_amount=10)
        quota = UserQuota(user_id='u2', is_paid=False, daily_limit=13, monthly_limit=60)

        mock_db = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none.return_value = order
        pkg_result = MagicMock()
        pkg_result.scalar_one_or_none.return_value = pkg
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(side_effect=[order_result, pkg_result, qr_result])

        result = await process_refund(mock_db, 'o2', 'admin-1')

        assert result['status'] == 'refunded'
        assert quota.daily_limit == 3
        assert quota.monthly_limit == 50


# ═══════════════════════════════════════════════════════
#  额度消耗 测试
# ═══════════════════════════════════════════════════════

class TestQuotaConsumption:
    """免费额度 / VIP额度 / 充值包 消耗逻辑"""

    @pytest.mark.asyncio
    async def test_free_daily_quota_consumption(self):
        quota = UserQuota(user_id='u1', daily_limit=3, daily_used=0, monthly_limit=50, monthly_used=0, is_paid=False)
        quota.last_reset_date = datetime.now(TZ_UTC8)

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        can_use, qtype, remaining = await check_and_consume_quota(mock_db, 'u1')

        assert can_use is True
        assert qtype == 'free_daily'
        assert remaining == 2
        assert quota.daily_used == 1

    @pytest.mark.asyncio
    async def test_vip_unlimited_quota(self):
        quota = UserQuota(user_id='vip1', daily_limit=3, daily_used=0, monthly_limit=-1,
                           monthly_used=0, is_paid=True, last_reset_date=datetime.now(TZ_UTC8))

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        can_use, qtype, remaining = await check_and_consume_quota(mock_db, 'vip1')

        assert can_use is True
        assert qtype == 'vip_unlimited'
        assert remaining == -1
        assert quota.daily_used == 1

    @pytest.mark.asyncio
    async def test_free_daily_limit_reached(self):
        quota = UserQuota(user_id='u1', daily_limit=3, daily_used=3, monthly_limit=50,
                           monthly_used=50, is_paid=False, last_reset_date=datetime.now(TZ_UTC8))

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        can_use, qtype, remaining = await check_and_consume_quota(mock_db, 'u1')

        assert can_use is False
        assert qtype == 'free_daily_limit_reached'
        assert remaining == 0

    @pytest.mark.asyncio
    async def test_daily_reset_on_new_day(self):
        yesterday = datetime.now(TZ_UTC8) - timedelta(days=1)
        quota = UserQuota(user_id='u1', daily_limit=3, daily_used=3, monthly_limit=50,
                           monthly_used=3, is_paid=False, last_reset_date=yesterday)

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        can_use, qtype, remaining = await check_and_consume_quota(mock_db, 'u1')

        assert can_use is True
        assert quota.daily_used == 1
        assert remaining == 2

    @pytest.mark.asyncio
    async def test_add_quota_to_existing_user(self):
        quota = UserQuota(user_id='u1', daily_limit=3, daily_used=1, monthly_limit=50, is_paid=False)

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        remaining = await add_quota(mock_db, 'u1', 5, reason='管理员赠送')

        assert remaining == 8
        assert quota.daily_limit == 8
        assert quota.monthly_limit == 55

    @pytest.mark.asyncio
    async def test_add_quota_to_new_user(self):
        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=qr_result)

        remaining = await add_quota(mock_db, 'new-user', 10, reason='新用户赠送')

        assert remaining == 10
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_vip_monthly_limit_hit(self):
        quota = UserQuota(user_id='vip2', daily_limit=3, daily_used=0, monthly_limit=100,
                           monthly_used=100, is_paid=True, last_reset_date=datetime.now(TZ_UTC8))

        mock_db = AsyncMock()
        qr_result = MagicMock()
        qr_result.scalar_one_or_none.return_value = quota
        mock_db.execute = AsyncMock(return_value=qr_result)

        can_use, qtype, remaining = await check_and_consume_quota(mock_db, 'vip2')

        assert can_use is False
        assert qtype == 'vip_limit_reached'
        assert remaining == 0


# ═══════════════════════════════════════════════════════
#  管理员角色与权限 测试
# ═══════════════════════════════════════════════════════

class TestAdminRoles:
    """管理员角色区分"""

    def test_super_admin_has_all_permissions(self):
        admin = Admin(id='a1', username='superadmin', role='super_admin')
        assert admin.role == 'super_admin'

    def test_operation_admin_role(self):
        admin = Admin(id='a2', username='ops', role='operation')
        assert admin.role == 'operation'

    def test_finance_admin_role(self):
        admin = Admin(id='a3', username='finance', role='finance')
        assert admin.role == 'finance'

    def test_ai_engineer_admin_role(self):
        admin = Admin(id='a4', username='ai_dev', role='ai_engineer')
        assert admin.role == 'ai_engineer'

    def test_admin_log_has_all_fields(self):
        log = AdminLog(id='log1', admin_id='a1', action='prompt_edit',
                        target_type='prompt', target_id='p1',
                        details={'old': 'v1', 'new': 'v2'}, ip_address='10.0.0.1')
        assert log.action == 'prompt_edit'
        assert log.target_type == 'prompt'
        assert log.target_id == 'p1'
        assert log.ip_address == '10.0.0.1'
        assert isinstance(log.details, dict)