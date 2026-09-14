"""Resolve provider credentials without storing secret material in COAir data.

Billing accounts may contain an opaque ``provider_key_ref``.  Dedicated file-based
refs resolve to a read-only file mounted into the API container.  Virtual org
sub-keys (``gk_…``) are COAir tracking aliases only — LLM calls still use the
platform ``GOOGLE_API_KEY``.  The real key is never stored in SQLite, returned by
an API, included in a cache key, or logged.
"""
from __future__ import annotations

import os
import re
import stat
from pathlib import Path

from .config import GOOGLE_API_KEY


GOOGLE_USER_KEY_DIR = Path(
    os.getenv("GOOGLE_USER_KEY_DIR", "/run/secrets/google_keys")
)
_SAFE_KEY_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_VIRTUAL_KEY_PREFIX = "gk_"


class ProviderCredentialError(RuntimeError):
    """A dedicated provider credential is configured but cannot be used."""


def validate_provider_key_ref(value: str) -> str:
    ref = str(value or "").strip()
    if ref and not _SAFE_KEY_REF.fullmatch(ref):
        raise ValueError("provider_key_ref must be a safe 1-64 character alias")
    return ref


def is_virtual_provider_key_ref(ref: str) -> bool:
    """True for COAir tracking sub-keys that share the platform Gemini credential."""
    return validate_provider_key_ref(ref).startswith(_VIRTUAL_KEY_PREFIX)


def current_provider_key_ref() -> str:
    """Return the active tracking/credential alias for the request user.

    Resolution order:
    1. Personal ``billing_accounts.provider_key_ref`` (file-backed or virtual)
    2. Company ``organizations.provider_key_ref`` when the registry key is active
    3. Empty string (platform / unassigned)
    """
    try:
        from backend.core.security import get_current_username
        from .user_store import get_user_store
    except ImportError:
        return ""
    username = get_current_username()
    if not username:
        return ""
    try:
        account = get_user_store().billing.get_account(username)
    except Exception as exc:
        # An authenticated call must never silently fall back to the shared key
        # merely because its credential binding could not be read.
        raise ProviderCredentialError("provider_key_binding_unavailable") from exc
    personal = validate_provider_key_ref(str((account or {}).get("provider_key_ref") or ""))
    if personal:
        return personal
    try:
        from .org_store import get_org_store
        from .ops_store import get_ops_store

        membership = get_org_store().membership_for(username)
        org_ref = validate_provider_key_ref(
            str((membership or {}).get("provider_key_ref") or "")
        )
        if not org_ref:
            return ""
        registered = get_ops_store().get_provider_key(org_ref)
        if registered and registered.get("status") == "active":
            return org_ref
    except ProviderCredentialError:
        raise
    except Exception:
        return ""
    return ""


def google_credential_scope() -> str:
    """Non-secret cache/audit scope; prevents cross-credential cache sharing."""
    try:
        from backend.core.security import get_current_username

        username = get_current_username() or "anonymous"
    except Exception:
        username = "anonymous"
    ref = current_provider_key_ref()
    return f"user:{username}:key:{ref}" if ref else "global"


def get_google_api_key_for_ref(ref: str) -> str:
    """Read a dedicated key by safe alias without returning it to an API client."""
    ref = validate_provider_key_ref(ref)
    if not ref:
        raise ProviderCredentialError("provider_key_reference_missing")
    if is_virtual_provider_key_ref(ref):
        if not GOOGLE_API_KEY:
            raise ProviderCredentialError("global_google_api_key_missing")
        return GOOGLE_API_KEY
    root = GOOGLE_USER_KEY_DIR.resolve()
    path = (root / ref).resolve()
    if path.parent != root:
        raise ProviderCredentialError("invalid_provider_key_reference")
    try:
        info = path.stat()
        if not stat.S_ISREG(info.st_mode):
            raise ProviderCredentialError("provider_key_secret_not_regular_file")
        if info.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
            raise ProviderCredentialError("provider_key_secret_permissions_too_open")
        key = path.read_text(encoding="utf-8").strip()
    except ProviderCredentialError:
        raise
    except OSError as exc:
        raise ProviderCredentialError("provider_key_secret_unavailable") from exc
    if len(key) < 20 or any(ch.isspace() for ch in key):
        raise ProviderCredentialError("provider_key_secret_invalid")
    return key


def get_google_api_key() -> str:
    """Resolve the request user's Gemini key, failing closed for dedicated file keys."""
    ref = current_provider_key_ref()
    if ref and not is_virtual_provider_key_ref(ref):
        return get_google_api_key_for_ref(ref)
    if not GOOGLE_API_KEY:
        raise ProviderCredentialError("global_google_api_key_missing")
    return GOOGLE_API_KEY


__all__ = [
    "ProviderCredentialError",
    "current_provider_key_ref",
    "get_google_api_key",
    "get_google_api_key_for_ref",
    "google_credential_scope",
    "is_virtual_provider_key_ref",
    "validate_provider_key_ref",
]
