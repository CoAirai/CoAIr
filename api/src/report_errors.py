"""Stable, non-sensitive error codes shared by report jobs and checkpoints."""

from __future__ import annotations

from typing import Union


ReportError = Union[BaseException, str]


def classify_report_error(error: ReportError) -> str:
    """Map provider/runtime failures to the report error-code allow-list."""
    name = type(error).__name__ if isinstance(error, BaseException) else ""
    value = str(error or "").casefold()
    by_class = {
        "LLMIncompleteResponseError": "model_output_incomplete",
        "LLMInvalidStructuredOutputError": "model_output_invalid",
        "LLMInputBudgetExceededError": "input_budget_exceeded",
        "LLMResearchBudgetExceededError": "research_budget_exhausted",
    }
    if name in by_class:
        return by_class[name]
    for code in (
        "model_output_incomplete", "model_output_invalid", "input_budget_exceeded",
        "source_verification_failed", "no_evidence", "insufficient_evidence",
        "research_budget_exhausted", "source_document_not_in_project",
        "source_document_selection_invalid", "chronology_preparation_expired",
    ):
        if code in value:
            return code
    if "429" in value or "rate limit" in value or "rate_limited" in value:
        return "provider_rate_limited"
    if "timeout" in value or "timed out" in value:
        return "provider_timeout"
    if any(marker in value for marker in ("authentication", "unauthorized", "api key", "401")):
        return "provider_authentication_failed"
    if "safety" in value or "blocked" in value:
        return "provider_safety_blocked"
    if "billing" in value or "payment required" in value:
        return "provider_billing_failed"
    if "schema rejection" in value or "invalid response schema" in value:
        return "provider_schema_rejected"
    return "report_generation_failed"


def diagnostic_summary(error: BaseException, *, maximum: int = 160) -> str:
    """Return a bounded internal diagnostic; never use it as an error code."""
    detail = " ".join(str(error or "").split())[:maximum]
    return f"{type(error).__name__}: {detail}".rstrip(": ")


__all__ = ["classify_report_error", "diagnostic_summary"]
