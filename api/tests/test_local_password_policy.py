import pytest
from src import config
from src.user_store import UserStore, validate_local_password

@pytest.mark.parametrize('password', ['short', 'abcdefghijk', 'é'*37])
def test_local_store_rejects_weak_or_overlong_bcrypt_input(monkeypatch,password):
    monkeypatch.setattr(config,'DEPLOYMENT_MODE','local')
    with pytest.raises(ValueError,match='password_requires_12'):
        UserStore._hash_password(password)

def test_local_policy_preserves_valid_passwords_and_cloud_policy(monkeypatch):
    monkeypatch.setattr(config,'DEPLOYMENT_MODE','local')
    password='valid-local-password'
    hashed=UserStore._hash_password(password)
    assert UserStore._verify(password,hashed)
    monkeypatch.setattr(config,'DEPLOYMENT_MODE','cloud')
    validate_local_password('cloud-existing-policy')
    validate_local_password('short')
