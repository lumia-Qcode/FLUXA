"""AI Provider factory for FLUXA per Section 4.5."""

from app.ai.anthropic_provider import AnthropicProvider
from app.ai.gemini_provider import GeminiProvider
from app.ai.mock_provider import MockProvider
from app.ai.openai_provider import OpenAIProvider
from app.ai.openrouter_provider import OpenRouterProvider
from app.ai.provider import BaseProvider
from app.config import Config


def get_provider(provider_override: str = None) -> BaseProvider:
    """Instantiate and return the configured AI provider.
    Priority:
    1. provider_override if given
    2. Config.AI_PROVIDER if explicitly set ('gemini' | 'openai' | 'anthropic' | 'openrouter' | 'mock')
    3. Auto-detection based on configured API keys:
       - GEMINI_API_KEY -> GeminiProvider
       - OPENAI_API_KEY -> OpenAIProvider
       - ANTHROPIC_API_KEY -> AnthropicProvider
       - OPENROUTER_API_KEY -> OpenRouterProvider
    4. MockProvider default
    """
    choice = (provider_override or Config.AI_PROVIDER or "").strip().lower()

    if choice == "gemini":
        return GeminiProvider()
    elif choice == "openai":
        return OpenAIProvider()
    elif choice == "anthropic":
        return AnthropicProvider()
    elif choice == "openrouter":
        return OpenRouterProvider()
    elif choice == "mock":
        return MockProvider()

    # Auto-detection if AI_PROVIDER is not explicitly specified
    if Config.GEMINI_API_KEY and Config.GEMINI_API_KEY.strip():
        return GeminiProvider()
    if Config.OPENAI_API_KEY and Config.OPENAI_API_KEY.strip():
        return OpenAIProvider()
    if Config.ANTHROPIC_API_KEY and Config.ANTHROPIC_API_KEY.strip():
        return AnthropicProvider()
    if Config.OPENROUTER_API_KEY and Config.OPENROUTER_API_KEY.strip():
        return OpenRouterProvider()

    return MockProvider()
