"""LlamaIndex synthesis adapter using the same audited local LLM boundary."""
from llama_index.core.llms import CustomLLM, CompletionResponse, LLMMetadata
from llama_index.core.llms.callbacks import llm_completion_callback

from .config import LLM_CONTEXT_TOKENS, LLM_LOCAL_OUTPUT_TOKENS, LLM_MODEL


class LocalLLM(CustomLLM):
    max_tokens: int = LLM_LOCAL_OUTPUT_TOKENS
    temperature: float = 0.1

    @property
    def metadata(self) -> LLMMetadata:
        return LLMMetadata(context_window=LLM_CONTEXT_TOKENS,
                           num_output=min(self.max_tokens, LLM_LOCAL_OUTPUT_TOKENS),
                           model_name=LLM_MODEL)

    @llm_completion_callback()
    def complete(self, prompt: str, **kwargs) -> CompletionResponse:
        from .llm_client import generate_text
        result = generate_text(prompt, max_tokens=self.max_tokens,
                               temperature=self.temperature, task_type="document_synthesis")
        return CompletionResponse(text=result.text)

    @llm_completion_callback()
    def stream_complete(self, prompt: str, **kwargs):
        response = self.complete(prompt, **kwargs)
        yield CompletionResponse(text=response.text, delta=response.text)
