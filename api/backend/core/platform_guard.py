"""Platform security enforcement: IP allowlist, rate limits, security headers."""

from __future__ import annotations

import ipaddress
import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Iterable, Optional


def trust_proxy() -> bool:
    return os.getenv("TRUST_PROXY", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def client_ip(request) -> str:
    if trust_proxy():
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if forwarded:
            return forwarded
        real = (request.headers.get("x-real-ip") or "").strip()
        if real:
            return real
    if getattr(request, "client", None) and request.client.host:
        return request.client.host
    return ""


def ip_allowed(client: str, allowlist: Iterable[str]) -> bool:
    entries = [str(entry).strip() for entry in allowlist if str(entry).strip()]
    if not entries:
        return True
    try:
        addr = ipaddress.ip_address(client)
    except ValueError:
        return False
    for entry in entries:
        try:
            if "/" in entry:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            elif addr == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def is_admin_api_path(path: str) -> bool:
    return path.startswith("/api/admin") or path.startswith("/api/usage")


def is_public_api_path(path: str) -> bool:
    public_prefixes = (
        "/api/auth/login",
        "/api/auth/mfa/",
        "/api/auth/email/",
        "/api/auth/invite/",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/access-requests",
        "/api/stripe/webhook",
        "/api/docs",
        "/api/openapi",
        "/docs",
        "/openapi",
        "/health",
    )
    if path in ("/api", "/api/"):
        return True
    return any(path == p or path.startswith(p) for p in public_prefixes)


class RateLimiter:
    """In-process sliding-window limiter (per worker)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str, *, limit: int, window_seconds: float) -> None:
        from fastapi import HTTPException

        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail="rate_limited",
                    headers={"Retry-After": str(int(window_seconds))},
                )
            bucket.append(now)


_rate_limiter = RateLimiter()


def rate_limit(key: str, *, limit: int, window_seconds: float = 60.0) -> None:
    _rate_limiter.check(key, limit=limit, window_seconds=window_seconds)


def expose_security_debug() -> bool:
    """MFA debug codes / local reset tokens — off in production."""
    flag = os.getenv("COAIR_DEBUG_MFA", "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return True
    if flag in ("0", "false", "no", "off"):
        return False
    env = (
        os.getenv("COAIR_ENV")
        or os.getenv("ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()
    return env not in ("production", "prod")


def require_signed_stripe_webhooks() -> bool:
    if os.getenv("COAIR_ALLOW_UNSIGNED_STRIPE_WEBHOOK", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return False
    env = (
        os.getenv("COAIR_ENV")
        or os.getenv("ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()
    return env in ("production", "prod") or bool(
        (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    )


def _security_headers_middleware_cls():
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response

    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault(
                "Referrer-Policy", "strict-origin-when-cross-origin"
            )
            response.headers.setdefault(
                "Permissions-Policy",
                "camera=(), microphone=(), geolocation=(), payment=()",
            )
            response.headers.setdefault("X-XSS-Protection", "0")
            if request.url.path.startswith("/api"):
                response.headers.setdefault("Cache-Control", "no-store")
            return response

    return SecurityHeadersMiddleware


def _ip_allowlist_middleware_cls():
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response

    class PlatformIpAllowlistMiddleware(BaseHTTPMiddleware):
        """When the allowlist is non-empty, gate Super Admin /admin API traffic."""

        async def dispatch(self, request, call_next):
            path = request.url.path
            if not is_admin_api_path(path):
                return await call_next(request)
            try:
                from src.ops_store import get_ops_store

                security = get_ops_store().get_security()
                allowlist = security.get("ip_allowlist") or []
                if allowlist and not ip_allowed(client_ip(request), allowlist):
                    return Response(
                        content='{"detail":"ip_not_allowed"}',
                        status_code=403,
                        media_type="application/json",
                    )
            except Exception:
                pass
            return await call_next(request)

    return PlatformIpAllowlistMiddleware


# Eager classes: assigning None + module __getattr__ breaks
# `from ... import SecurityHeadersMiddleware` (name resolves to None).
try:
    SecurityHeadersMiddleware = _security_headers_middleware_cls()
    PlatformIpAllowlistMiddleware = _ip_allowlist_middleware_cls()
except Exception:  # pragma: no cover - helpers importable without Starlette
    SecurityHeadersMiddleware = None  # type: ignore
    PlatformIpAllowlistMiddleware = None  # type: ignore


__all__ = [
    "SecurityHeadersMiddleware",
    "PlatformIpAllowlistMiddleware",
    "client_ip",
    "ip_allowed",
    "is_admin_api_path",
    "is_public_api_path",
    "rate_limit",
    "expose_security_debug",
    "require_signed_stripe_webhooks",
    "trust_proxy",
]
