"""
JWT auth + FastAPI dependencies + a request-scoped current-user contextvar.

Production verifies Supabase Auth (ES256) access tokens. Tests and AUTH_PROVIDER=local
still mint/verify HS256 tokens with JWT_SECRET.
"""
from __future__ import annotations

import os
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from src.user_store import (
    ADMIN_ROLES,
    SUPERADMIN_ROLE,
    VALID_ROLES,
    UserStore,
    get_user_store,
)


JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_TTL_DAYS = int(os.getenv("JWT_TTL_DAYS", "7"))


def _require_secret() -> str:
    if not JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is not set. Generate one with "
            "`python -c \"import secrets;print(secrets.token_urlsafe(48))\"` "
            "and add it to .env."
        )
    return JWT_SECRET


def is_admin(role: str) -> bool:
    """True for any role with operator powers (admin or superadmin)."""
    return role in ADMIN_ROLES


@dataclass
class UserContext:
    """Decoded current user for an authenticated request."""

    username: str
    role: str
    display_name: str
    features: Dict[str, bool]
    token_limit: int
    impersonator: Optional[str] = None


current_user_var: ContextVar[Optional[UserContext]] = ContextVar(
    "current_user", default=None
)


def get_current_username() -> Optional[str]:
    """Helper used by llm_client to attribute usage. None for unauthenticated work."""
    user = current_user_var.get()
    return user.username if user else None


def set_current_user_context(username: str) -> Optional[UserContext]:
    """Stamp a worker thread with the same identity used by request handlers."""
    record = get_user_store().get_user(username)
    if not record or not record.get("is_active"):
        current_user_var.set(None)
        return None
    user = UserContext(
        username=record["username"], role=record["role"],
        display_name=record["display_name"], features=record["features"],
        token_limit=record["token_limit"],
    )
    current_user_var.set(user)
    return user


def hash_password(plain: str) -> str:
    import bcrypt

    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt

    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    username: str,
    role: str,
    *,
    impersonator: Optional[str] = None,
    ttl: Optional[timedelta] = None,
    token_epoch: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    lifetime = ttl or timedelta(days=JWT_TTL_DAYS)
    payload: Dict[str, Any] = {
        "sub": username,
        "role": role,
        "ver": int(token_epoch or 0),
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
    }
    if impersonator:
        payload["act"] = impersonator
        payload["imp"] = True
    return jwt.encode(payload, _require_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    header = jwt.get_unverified_header(token)
    alg = str(header.get("alg") or "")
    if alg == "ES256":
        from src.supabase_auth import decode_supabase_token
        return decode_supabase_token(token)
    return jwt.decode(token, _require_secret(), algorithms=[JWT_ALGORITHM])


_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="not_authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _UNAUTHORIZED
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    store: UserStore = Depends(get_user_store),
) -> UserContext:
    """Resolve the active user from a Bearer JWT. Sets the contextvar as a side effect."""
    token = _bearer_token(authorization)
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, "invalid_token") from exc
    except Exception as exc:
        raise HTTPException(401, "invalid_token") from exc

    header = jwt.get_unverified_header(token)
    supabase_token = str(header.get("alg") or "") == "ES256"
    if supabase_token:
        from src.auth_provision import maybe_bootstrap_superadmin
        from src.supabase_auth import username_from_payload
        username = username_from_payload(payload)
        sub = str(payload.get("sub") or "")
        record = store.find_user(username) if username else None
        if not record and sub:
            record = store.get_user_by_supabase_id(sub)
        if not record:
            record = maybe_bootstrap_superadmin(store, payload, sub)
    else:
        username = payload.get("sub")
        record = store.get_user(username) if username else None

    if not record:
        raise HTTPException(401, "unknown_user")
    if not record["is_active"]:
        raise HTTPException(403, "account_disabled")

    epoch = int(record.get("token_epoch") or 0)
    if epoch:
        if supabase_token:
            issued = int(payload.get("iat") or 0)
            if issued < epoch:
                raise HTTPException(401, "session_revoked")
        else:
            version = int(payload.get("ver") or 0)
            if version < epoch:
                raise HTTPException(401, "session_revoked")

    actor = payload.get("act") if payload.get("imp") else None
    impersonator = actor if isinstance(actor, str) and actor.strip() else None

    user = UserContext(
        username=record["username"],
        role=record["role"],
        display_name=record["display_name"],
        features=record["features"],
        token_limit=record["token_limit"],
        impersonator=impersonator,
    )
    current_user_var.set(user)
    return user


def require_admin(user: UserContext = Depends(get_current_user)) -> UserContext:
    if not is_admin(user.role):
        raise HTTPException(403, "admin_required")
    return user


def require_superadmin(user: UserContext = Depends(get_current_user)) -> UserContext:
    """Tenant-owner tier: may manage admin accounts themselves."""
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(403, "superadmin_required")
    return user


def require_feature(feature_name: str) -> Callable[[UserContext], UserContext]:
    """Dependency factory: 403 if `feature_name` is not enabled for the user."""

    def _checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.features.get(feature_name, False):
            raise HTTPException(403, f"feature_not_available:{feature_name}")
        return user

    return _checker


__all__ = [
    "ADMIN_ROLES",
    "SUPERADMIN_ROLE",
    "VALID_ROLES",
    "is_admin",
    "UserContext",
    "current_user_var",
    "get_current_username",
    "set_current_user_context",
    "hash_password",
    "verify_password",
    "create_access_token",
    "decode_token",
    "get_current_user",
    "require_admin",
    "require_superadmin",
    "require_feature",
    "JWT_SECRET",
]
