from src.database import postgres_connect_kwargs


def test_postgres_pool_disables_prepared_statements():
    kwargs = postgres_connect_kwargs()
    assert kwargs["prepare_threshold"] is None
    assert kwargs["autocommit"] is False
    assert kwargs["connect_timeout"] == 10
