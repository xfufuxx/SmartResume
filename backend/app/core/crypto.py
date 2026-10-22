"""
字段级加密工具（AES-256-GCM AEAD）+ 数据脱敏

密文格式（自带版本前缀，见《项目全面审查与优化建议》问题 11/12）：
  v2:<base64(nonce_12 ‖ ciphertext ‖ tag_16)>   AESGCM，当前写格式（防篡改）
  v1:<base64(iv_16 ‖ ciphertext)>               AES-256-CBC，历史格式（只读兼容，无 MAC）
  <base64(iv_16 ‖ ciphertext)>                  无前缀 = 最早的 v1（只读兼容）

密钥来源（app/config.py，三者职责分离）：
  FIELD_ENCRYPTION_KEY        当前写密钥（v2）
  FIELD_ENCRYPTION_PREVIOUS   轮换窗口期旧密钥（逗号分隔，仅解密）
  LEGACY_CBC_KEY              旧 SECRET_KEY，仅用于解密 v1 历史数据（默认 "change-me-in-production"）

设计要点：
  - 解密失败（认证失败/格式损坏/密钥全不匹配）统一返回 None + 审计日志，
    不向客户端暴露细节，也不抛异常把上层变成 500；
  - 轮换窗口：新写入一律 v2；解密按「当前密钥 → 旧密钥列表」顺序尝试；
  - `is_legacy_ciphertext()` 供重加密脚本识别待迁移数据。
"""
import base64
import binascii
import logging
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

logger = logging.getLogger(__name__)

_V2_PREFIX = "v2:"
_V1_PREFIX = "v1:"
_NONCE_LEN = 12  # AESGCM 推荐 96bit


def _derive_key(material: str) -> bytes:
    """HKDF-SHA256 派生 32 字节密钥（替代早期的裸 sha256，语义更清晰）。"""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"smart-resume/field-encryption/v2",
        info=b"aes-256-gcm-field",
    ).derive(material.encode("utf-8"))


def _key_ring() -> list[bytes]:
    """解密用密钥环：当前密钥 + 轮换窗口期旧密钥（按优先级排序）。"""
    keys: list[bytes] = []
    current = settings.FIELD_ENCRYPTION_KEY
    if current:
        keys.append(_derive_key(current))
    for legacy in [k.strip() for k in (settings.FIELD_ENCRYPTION_PREVIOUS or "").split(",") if k.strip()]:
        keys.append(_derive_key(legacy))
    if not keys:
        # 开发环境且未配置 FIELD_ENCRYPTION_KEY：进程内随机密钥（重启后旧密文不可解，
        # 仅影响本地开发数据）。warning 提醒配置，绝不静默使用固定默认值。
        if "_EPHEMERAL_KEY" not in globals():
            globals()["_EPHEMERAL_KEY"] = AESGCM.generate_key(bit_length=256)
            logger.warning(
                "[字段加密] FIELD_ENCRYPTION_KEY 未配置，已生成进程内随机密钥；"
                "重启后此前加密的数据将无法解密（仅限开发环境）。"
            )
        keys.append(globals()["_EPHEMERAL_KEY"])
    return keys


def _legacy_cbc_key() -> bytes:
    """v1 AES-256-CBC 历史密文的解密密钥（旧 SECRET_KEY 的裸 sha256，保持逐位兼容）。"""
    import hashlib

    material = settings.LEGACY_CBC_KEY or "change-me-in-production"
    return hashlib.sha256(material.encode()).digest()


def encrypt_field(plaintext: str) -> str:
    """加密字段 → v2 AESGCM 密文（带认证标签，防比特翻转篡改）。

    Fail-fast：未配置 FIELD_ENCRYPTION_KEY 时**拒绝写入**（开发环境留空会用
    进程内随机密钥，写库后重启即永久无法解密——这是真实发生过的事故，
    见 scripts/reencrypt_fields.py 的迁移前置校验）。
    """
    current = settings.FIELD_ENCRYPTION_KEY
    if not current:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY 未配置，拒绝加密写入（否则随机密钥写库后将永久无法解密）。"
            "请在 backend/.env 配置该密钥。"
        )
    key = _derive_key(current)
    nonce = secrets.token_bytes(_NONCE_LEN)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return _V2_PREFIX + base64.b64encode(nonce + ciphertext).decode("utf-8")


def _decrypt_v2(payload: str) -> str | None:
    raw = base64.b64decode(payload)
    nonce, ciphertext = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    for key in _key_ring():
        try:
            return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")
        except Exception:  # noqa: BLE001 —— 单密钥认证失败即试下一把（密钥轮换窗口）
            continue
    return None


def _decrypt_v1(payload: str) -> str | None:
    """解密最早的 AES-256-CBC 密文（无完整性校验，仅为迁移兼容保留）。"""
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    raw = base64.b64decode(payload)
    if len(raw) < 32 or len(raw) % 16 != 0:
        return None
    iv, ciphertext = raw[:16], raw[16:]
    try:
        decryptor = Cipher(
            algorithms.AES(_legacy_cbc_key()), modes.CBC(iv), backend=default_backend()
        ).decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        pad_len = padded[-1]
        if not 1 <= pad_len <= 16 or padded[-pad_len:] != bytes([pad_len]) * pad_len:
            return None  # padding 非法 = 密钥不匹配或数据损坏
        return padded[:-pad_len].decode("utf-8")
    except Exception:  # noqa: BLE001
        return None


def decrypt_field(ciphertext_b64: str | None) -> str | None:
    """解密字段；失败（损坏/篡改/密钥不匹配）返回 None 并记审计日志，不抛异常。

    Args:
        ciphertext_b64: 带版本前缀的密文；None/空串原样返回 None。
    """
    if not ciphertext_b64:
        return None
    try:
        if ciphertext_b64.startswith(_V2_PREFIX):
            plain = _decrypt_v2(ciphertext_b64[len(_V2_PREFIX):])
            if plain is None:
                logger.warning("[字段加密] v2 密文认证失败或密钥不匹配（已按防篡改策略拒绝解密）")
            return plain
        if ciphertext_b64.startswith(_V1_PREFIX):
            plain = _decrypt_v1(ciphertext_b64[len(_V1_PREFIX):])
        else:
            plain = _decrypt_v1(ciphertext_b64)
        if plain is None:
            logger.warning("[字段加密] v1 历史密文解密失败（密钥不匹配或数据损坏）")
        return plain
    except (binascii.Error, ValueError, UnicodeDecodeError) as e:
        logger.warning("[字段加密] 密文格式非法，拒绝解密: %s", type(e).__name__)
        return None


def is_legacy_ciphertext(value: str | None) -> bool:
    """是否为待迁移的 v1/无前缀密文（重加密脚本用）。"""
    if not value:
        return False
    return not value.startswith(_V2_PREFIX)


def mask_phone(phone: str) -> str:
    if len(phone) < 7:
        return phone
    return phone[:3] + "****" + phone[-4:]


def mask_email(email: str) -> str:
    parts = email.split("@")
    if len(parts) != 2:
        return email
    local = parts[0]
    if len(local) <= 2:
        return local[0] + "***@" + parts[1]
    return local[:2] + "***@" + local[-1] + "@" + parts[1]
