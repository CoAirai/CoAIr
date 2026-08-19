"""GoTrue (Supabase Auth) helpers: password login, admin users, JWKS verify."""
from __future__ import annotations

import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

import jwt
from jwt import PyJWKClient

from .logger import logger

AUTH_EMAIL_DOMAIN = os.getenv("SUPABASE_AUTH_EMAIL_DOMAIN", "users.coair.local")
_jwks_client: Optional[PyJWKClient] = None
_pending_mfa: Dict[str, Dict[str, Any]] = {}


def supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").strip().rstrip("/")


def anon_key() -> str:
    return os.getenv("SUPABASE_ANON_KEY", "").strip()


def service_role_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def use_supabase_auth() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    provider = os.getenv("AUTH_PROVIDER", "").strip().lower()
    if provider == "local":
        return False
    if provider == "supabase":
        return bool(supabase_url() and anon_key() and service_role_key())
    return bool(supabase_url() and anon_key() and service_role_key())


def auth_email(username: str) -> str:
    clean = (username or "").strip()
    if "@" in clean:
        return clean.lower()
    return f"{clean.lower()}@{AUTH_EMAIL_DOMAIN}"


def username_from_email(email: str) -> str:
    value = (email or "").strip().lower()
    suffix = f"@{AUTH_EMAIL_DOMAIN}".lower()
    if value.endswith(suffix):
        return value[: -len(suffix)]
    return value


def _request(
    method: str,
    path: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    admin: bool = False,
) -> Dict[str, Any]:
    base = supabase_url()
    if not base:
        raise RuntimeError("supabase_url_missing")
    key = service_role_key() if admin else anon_key()
    url = f"{base}/auth/v1{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"supabase_auth_{exc.code}:{detail[:500]}") from exc


def sign_in_password(username: str, password: str) -> Dict[str, Any]:
    payload = _request(
        "POST",
        "/token?grant_type=password",
        body={"email": auth_email(username), "password": password},
    )
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("supabase_auth_no_token")
    return payload


def find_auth_user_id(username: str) -> Optional[str]:
    email = auth_email(username)
    listed = _request("GET", "/admin/users?page=1&per_page=200", admin=True)
    for row in listed.get("users") or []:
        if str(row.get("email") or "").lower() == email:
            return str(row.get("id") or "")
    return None


def ensure_auth_user(username: str, password: str, *, reset_password: bool = True) -> str:
    """Create a GoTrue user, or update password when migrating/resetting."""
    email = auth_email(username)
    existing = find_auth_user_id(username)
    if existing:
        if reset_password:
            _request(
                "PUT",
                f"/admin/users/{existing}",
                admin=True,
                body={
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"username": username},
                },
            )
        return existing
    created = _request(
        "POST",
        "/admin/users",
        admin=True,
        body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": username},
        },
    )
    user_id = str(created.get("id") or (created.get("user") or {}).get("id") or "")
    if not user_id:
        raise RuntimeError("supabase_create_user_no_id")
    return user_id


def app_origin() -> str:
    return (
        os.getenv("COAIR_LOGIN_URL", "").strip().rstrip("/")
        or os.getenv("COAIR_APP_URL", "").strip().rstrip("/")
        or os.getenv("NEXT_PUBLIC_APP_URL", "").strip().rstrip("/")
        or "http://localhost:3002"
    )


def auth_redirect(path: str = "/auth/reset-password") -> str:
    return f"{app_origin()}{path}"


def invite_user(email: str, *, username: str) -> str:
    """Send a Supabase invite email; user sets their own password from the link."""
    payload = _request(
        "POST",
        "/invite",
        admin=True,
        body={
            "email": email.strip().lower(),
            "data": {"username": username},
            "redirect_to": auth_redirect(),
        },
    )
    user = payload.get("user") or payload
    user_id = str(user.get("id") or "")
    if user_id:
        return user_id
    found = find_auth_user_id(username) or find_auth_user_id(email)
    if not found:
        raise RuntimeError("supabase_invite_no_id")
    return found


def sync_auth_user(username: str, password: str) -> str:
    """Ensure a GoTrue account exists without sending Supabase emails."""
    if not use_supabase_auth():
        return ""
    return ensure_auth_user(username, password)


def invite_or_recover(
    email: str, username: str, *, password: str = ""
) -> str:
    """Ensure GoTrue user exists. Welcome mail is sent via Resend, not Supabase."""
    if not use_supabase_auth():
        return ""
    pwd = password or secrets.token_urlsafe(18)
    existing = find_auth_user_id(username) or find_auth_user_id(email)
    if existing and not password:
        return existing
    return sync_auth_user(username, pwd)


def recover_password(email: str) -> None:
    redirect = urllib.parse.quote(auth_redirect(), safe="")
    _request(
        "POST",
        f"/recover?redirect_to={redirect}",
        body={"email": email.strip().lower()},
    )


def sign_out_user(user_id: str) -> None:
    try:
        _request("POST", f"/admin/users/{user_id}/logout", admin=True, body={})
    except RuntimeError as exc:
        logger.warning("supabase_sign_out_failed user_id=%s err=%s", user_id, exc)


def impersonate_session(username: str) -> Dict[str, Any]:
    import secrets

    if not find_auth_user_id(username):
        ensure_auth_user(username, secrets.token_urlsafe(18), reset_password=False)
    email = auth_email(username)
    link = _request(
        "POST",
        "/admin/generate_link",
        admin=True,
        body={"type": "magiclink", "email": email},
    )
    props = link.get("properties") or link
    token_hash = (
        props.get("hashed_token")
        or link.get("hashed_token")
        or props.get("email_otp")
    )
    if not token_hash:
        raise RuntimeError("supabase_impersonate_no_hash")
    session = _request(
        "POST",
        "/verify",
        body={
            "type": "magiclink",
            "token_hash": token_hash,
            "email": email,
        },
    )
    # verify may nest the session
    if not session.get("access_token") and isinstance(session.get("session"), dict):
        session = session["session"]
    if not session.get("access_token"):
        raise RuntimeError("supabase_impersonate_no_session")
    return session


def decode_supabase_token(token: str) -> Dict[str, Any]:
    global _jwks_client
    base = supabase_url()
    if not base:
        raise jwt.InvalidTokenError("supabase_url_missing")
    if _jwks_client is None:
        _jwks_client = PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True)
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=f"{base}/auth/v1",
    )


def username_from_payload(payload: Dict[str, Any]) -> str:
    meta = payload.get("user_metadata") or payload.get("app_metadata") or {}
    if isinstance(meta, dict):
        named = str(meta.get("username") or "").strip()
        if named:
            return named
    email = str(payload.get("email") or "").strip()
    if email:
        return username_from_email(email)
    return str(payload.get("sub") or "").strip()


def stash_mfa_session(challenge_id: str, session: Dict[str, Any]) -> None:
    _pending_mfa[challenge_id] = {"session": session, "exp": time.time() + 600}


def take_mfa_session(challenge_id: str) -> Optional[Dict[str, Any]]:
    row = _pending_mfa.pop(challenge_id, None)
    if not row or row["exp"] < time.time():
        return None
    return row["session"]
