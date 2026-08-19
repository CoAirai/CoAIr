from src.auth_provision import maybe_bootstrap_superadmin
from src.user_store import UserStore


def test_bootstrap_creates_superadmin(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPERADMIN_EMAIL", "owner@coair.ai")
    store = UserStore(db_path=tmp_path / "users.db")
    record = maybe_bootstrap_superadmin(
        store, {"email": "owner@coair.ai"}, "auth-uuid"
    )
    assert record is not None
    assert record["username"] == "owner@coair.ai"
    assert record["role"] == "superadmin"
    assert store.get_user_by_supabase_id("auth-uuid")["username"] == "owner@coair.ai"


def test_bootstrap_ignores_other_emails(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPERADMIN_EMAIL", "owner@coair.ai")
    store = UserStore(db_path=tmp_path / "users.db")
    assert maybe_bootstrap_superadmin(store, {"email": "other@firm.com"}, "x") is None
