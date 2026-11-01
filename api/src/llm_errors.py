"""Keep local generation failures out of legacy success-shaped fallbacks."""
def raise_local_generation_error(error):
    from .config import LOCAL_LLM
    if not LOCAL_LLM:
        return
    from .llm_client import (LLMIncompleteResponseError, LLMInvalidStructuredOutputError,
                             LLMInputBudgetExceededError, LLMResearchBudgetExceededError)
    from .openai_compatible import ContextLimitError
    from .user_store import UserQuotaExceededError
    from .billing_store import CreditBalanceExceededError
    from .usage_tracker import BudgetExceededError
    import httpx
    from openai import APIError
    from fastapi import HTTPException
    if isinstance(error, (LLMIncompleteResponseError, LLMInvalidStructuredOutputError,
                          LLMInputBudgetExceededError, LLMResearchBudgetExceededError,
                          ContextLimitError, UserQuotaExceededError, CreditBalanceExceededError,
                          BudgetExceededError, TimeoutError, httpx.HTTPError, APIError, HTTPException)):
        raise error
