from src.report_errors import classify_report_error


def test_report_error_codes_are_stable_and_non_sensitive():
    from src.llm_client import (
        LLMIncompleteResponseError, LLMInputBudgetExceededError,
        LLMInvalidStructuredOutputError,
    )

    cases = {
        LLMIncompleteResponseError("secret A"): "model_output_incomplete",
        LLMInvalidStructuredOutputError("secret B"): "model_output_invalid",
        LLMInputBudgetExceededError("secret C"): "input_budget_exceeded",
        RuntimeError("429 API key=secret"): "provider_rate_limited",
        RuntimeError("unexpected secret provider payload"): "report_generation_failed",
    }
    for error, expected in cases.items():
        code = classify_report_error(error)
        assert code == expected
        assert "secret" not in code
