from src.email_delivery import build_email, send_coair_email


def test_build_password_reset_includes_token(monkeypatch):
    monkeypatch.setenv("COAIR_APP_URL", "http://localhost:3002")
    message = build_email(
        "password_reset",
        "user@example.com",
        name="User",
        reset_token="abc123",
    )
    assert "token=abc123" in message["html"]
    assert "token=abc123" in message["text"]
    assert "/images/coair-logo.png" in message["html"]
    assert "Reset password" in message["html"]


def test_build_login_and_reset_alert(monkeypatch):
    monkeypatch.setenv("COAIR_APP_URL", "http://localhost:3002")
    login = build_email(
        "login_alert",
        "user@example.com",
        name="User",
        company_name="Acme",
        description="You just signed in to COAir.",
    )
    assert "sign-in" in login["subject"].lower() or "Sign-in" in login["html"]
    assert "You just signed in" in login["html"]

    alert = build_email(
        "password_reset_alert",
        "owner@example.com",
        company_name="Acme",
        description="User (user@example.com) requested a password reset.",
    )
    assert "Password reset requested" in alert["subject"]
    assert "User" in alert["html"]


def test_build_team_invite_includes_logo_and_button(monkeypatch):
    monkeypatch.setenv("COAIR_APP_URL", "http://localhost:3002")
    message = build_email(
        "team_invite",
        "user@example.com",
        company_name="Acme",
        temporary_password="Temp123!",
    )
    assert "/images/coair-logo.png" in message["html"]
    assert "Open COAir" in message["html"]
    assert "Temp123!" in message["html"]


def test_send_dry_run_without_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    result = send_coair_email("team_invite", "user@example.com", company_name="Acme")
    assert result["ok"] is True
    assert result["mode"] == "dry-run"
