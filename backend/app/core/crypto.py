"""
AES-256 加密/解密工具 + 数据脱敏
依赖: pip install cryptography
"""
import base64
import hashlib
import secrets
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from app.config import settings

_ENCRYPTION_KEY = hashlib.sha256(settings.SECRET_KEY.encode()).digest()


def encrypt_field(plaintext: str) -> str:
    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(_ENCRYPTION_KEY), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    padded = plaintext.encode("utf-8")
    pad_len = 16 - (len(padded) % 16)
    padded += bytes([pad_len]) * pad_len
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return base64.b64encode(iv + ciphertext).decode("utf-8")


def decrypt_field(ciphertext_b64: str) -> str:
    raw = base64.b64decode(ciphertext_b64)
    iv = raw[:16]
    ciphertext = raw[16:]
    cipher = Cipher(algorithms.AES(_ENCRYPTION_KEY), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    pad_len = padded[-1]
    return padded[:-pad_len].decode("utf-8")


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
    return local[:2] + "***" + local[-1] + "@" + parts[1]