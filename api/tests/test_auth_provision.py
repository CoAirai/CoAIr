import src.auth_provision as auth_provision
from src.auth_provision import maybe_bootstrap_superadmin, provision_invited_user
from src.user_store import (
    ACCOUNT_ACTIVE,
    ACCOUNT_DISABLED,
    ACCOUNT_INVITED,
    UserStore,
    normalize_account_status,
)


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


def _status(record):
    return normalize_account_status(
        record.get("account_status"), is_active=bool(record.get("is_active"))
    )


def test_soft_deleted_account_cannot_count_as_active(tmp_path):
    store = UserStore(db_path=tmp_path / "users.db")
    store.create_user(username="member@firm.com", password="secret123")
    assert _status(store.get_user("member@firm.com")) == ACCOUNT_ACTIVE

    store.delete_user("member@firm.com", soft=True)

    assert _status(store.get_user("member@firm.com")) == ACCOUNT_DISABLED
    assert normalize_account_status(ACCOUNT_ACTIVE, is_active=False) == ACCOUNT_DISABLED


def test_reinviting_a_deactivated_account_reopens_activation(tmp_path, monkeypatch):
    sent = []
    monkeypatch.setattr(auth_provision, "use_supabase_auth", lambda: False)
    monkeypatch.setattr(
        auth_provision, "issue_invite_activation_email",
        lambda **kwargs: sent.append(kwargs["email"]) or {"emailed": True},
    )
    store = UserStore(db_path=tmp_path / "users.db")
    store.create_user(username="member@firm.com", password="secret123")
    store.delete_user("member@firm.com", soft=True)

    record = provision_invited_user(store, "member@firm.com", email_kind="team_invite")

    assert record["account_status"] == ACCOUNT_INVITED
    assert not record["is_active"]
    assert sent == ["member@firm.com"]


def test_inviting_an_active_account_leaves_it_alone(tmp_path, monkeypatch):
    sent = []
    monkeypatch.setattr(auth_provision, "use_supabase_auth", lambda: False)
    monkeypatch.setattr(
        auth_provision, "issue_invite_activation_email",
        lambda **kwargs: sent.append(kwargs["email"]) or {"emailed": True},
    )
    store = UserStore(db_path=tmp_path / "users.db")
    store.create_user(username="member@firm.com", password="secret123")

    record = provision_invited_user(store, "member@firm.com")

    assert _status(record) == ACCOUNT_ACTIVE
    assert sent == []
