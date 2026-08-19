from src.supabase_auth import auth_email, username_from_email, username_from_payload


def test_auth_email_for_usernames():
    assert auth_email("ops") == "ops@users.coair.local"
    assert auth_email("acme-admin") == "acme-admin@users.coair.local"


def test_auth_email_passthrough_for_real_emails():
    assert auth_email("Ada@Firm.com") == "ada@firm.com"


def test_username_from_synthetic_email():
    assert username_from_email("ops@users.coair.local") == "ops"


def test_username_from_payload_prefers_metadata():
    assert username_from_payload({
        "email": "ops@users.coair.local",
        "user_metadata": {"username": "ops"},
        "sub": "uuid",
    }) == "ops"
