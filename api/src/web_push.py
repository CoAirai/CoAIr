"""Web Push (RFC 8291 aes128gcm + VAPID) using the cryptography package already installed."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from base64 import urlsafe_b64decode, urlsafe_b64encode
from pathlib import Path
from typing import Dict
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from src.config import STORAGE_DIR
from src.logger import logger

_KEY_PATH = Path(STORAGE_DIR) / "vapid_private.pem"
_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:ops@coair.ai")


def _b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return urlsafe_b64decode(value + pad)


def _private_key():
    if _KEY_PATH.is_file():
        return serialization.load_pem_private_key(_KEY_PATH.read_bytes(), password=None)
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    key = ec.generate_private_key(ec.SECP256R1())
    _KEY_PATH.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    try:
        _KEY_PATH.chmod(0o600)
    except OSError:
        pass
    return key


def vapid_public_key() -> str:
    public = _private_key().public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url(public)


def _vapid_jwt(endpoint: str) -> str:
    origin = urlsplit(endpoint)
    audience = f"{origin.scheme}://{origin.netloc}"
    private = _private_key()
    header = _b64url(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    payload = _b64url(
        json.dumps(
            {
                "aud": audience,
                "exp": int(time.time()) + 12 * 3600,
                "sub": _SUBJECT,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing = f"{header}.{payload}".encode()
    der = private.sign(signing, ec.ECDSA(hashes.SHA256()))
    r_value, s_value = decode_dss_signature(der)
    signature = _b64url(r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big"))
    return f"{header}.{payload}.{signature}"


def _encrypt(payload: bytes, p256dh: str, auth: str) -> bytes:
    user_public = _b64url_decode(p256dh)
    user_auth = _b64url_decode(auth)
    local = ec.generate_private_key(ec.SECP256R1())
    local_public = local.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    remote = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), user_public)
    shared = local.exchange(ec.ECDH(), remote)
    salt = os.urandom(16)
    info = b"WebPush: info\x00" + user_public + local_public
    ikm = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=user_auth, info=info
    ).derive(shared)
    cek = HKDF(
        algorithm=hashes.SHA256(),
        length=16,
        salt=salt,
        info=b"Content-Encoding: aes128gcm\x00",
    ).derive(ikm)
    nonce = HKDF(
        algorithm=hashes.SHA256(),
        length=12,
        salt=salt,
        info=b"Content-Encoding: nonce\x00",
    ).derive(ikm)
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    record_size = (4096).to_bytes(4, "big")
    return salt + record_size + bytes([len(local_public)]) + local_public + ciphertext


def send_web_push(subscription: Dict[str, str], payload: Dict[str, str]) -> str:
    """Return 'sent', 'gone', or 'failed'. Never raises."""
    endpoint = str(subscription.get("endpoint") or "")
    p256dh = str(subscription.get("p256dh") or "")
    auth = str(subscription.get("auth") or "")
    if not endpoint.startswith("https://") or not p256dh or not auth:
        return "failed"
    try:
        body = _encrypt(
            json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            p256dh,
            auth,
        )
        public = vapid_public_key()
        token = _vapid_jwt(endpoint)
        request = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "TTL": "86400",
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                "Authorization": f"vapid t={token},k={public}",
            },
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
        return "sent"
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 410):
            return "gone"
        logger.warning("web_push_http status=%s", exc.code)
        return "failed"
    except Exception:
        logger.exception("web_push_failed")
        return "failed"
