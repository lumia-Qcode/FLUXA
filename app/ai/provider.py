"""Base Provider interface and typed error classes for FLUXA AI integrations."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple


class AIError(Exception):
    """Base exception for all AI operations."""

    code = "provider_error"

    def __init__(self, message: str, code: str = None):
        super().__init__(message)
        if code:
            self.code = code


class NotConfiguredError(AIError):
    code = "not_configured"


class RateLimitedError(AIError):
    code = "rate_limited"


class InvalidOutputError(AIError):
    code = "invalid_output"


class TimeoutError(AIError):
    code = "timeout"


class ProviderError(AIError):
    code = "provider_error"


class BaseProvider(ABC):
    """Abstract interface implemented by all AI providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the provider (e.g. 'mock', 'anthropic', 'openrouter')."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider has necessary API credentials configured."""
        pass

    @abstractmethod
    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        """Generate a presentation outline containing a title and slide intents.
        Returns:
            {
                "title": str,
                "slides": [
                    {
                        "title": str,
                        "layout": str,
                        "purpose": str,
                        "visual": str  # chart | kpi | timeline | comparison | quote | none
                    }
                ]
            }
        """
        pass

    @abstractmethod
    def generate_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate semantic content for a single slide from its outline item and deck context.
        Returns semantic slide dict suitable for `compile_semantic_slide`.
        """
        pass

    @abstractmethod
    def chat_ops(
        self,
        message: str,
        current_slide: Dict[str, Any],
        deck_context: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Process an AI chat instruction on a slide or deck.
        Returns:
            (assistant_text, ops_list)
        """
        pass
