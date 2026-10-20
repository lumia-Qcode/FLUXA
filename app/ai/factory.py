"""AI Provider factory for FLUXA per Section 4.5."""

from app.ai.anthropic_provider import AnthropicProvider
from app.ai.mock_provider import MockProvider
from app.ai.openrouter_provider import OpenRouterProvider
from app.ai.provider import BaseProvider
from app.config import Config


def get_provider(provider_override: str = None) -> BaseProvider:
    """Instantiate and return the configured AI provider.
    Priority:
    1. provider_override if given
    2. Config.AI_PROVIDER ('anthropic' | 'openrouter' | 'mock')
    3. MockProvider default
    """
    choice = (provider_override or Config.AI_PROVIDER or "mock").strip().lower()

    if choice == "anthropic":
        return AnthropicProvider()
    elif choice == "openrouter":
        return OpenRouterProvider()
    else:
        return MockProvider()
