"""FLUXA AI layer module."""

from app.ai.compiler import compile_semantic_slide, repair_content_limits
from app.ai.factory import get_provider
from app.ai.provider import (
    AIError,
    BaseProvider,
    InvalidOutputError,
    NotConfiguredError,
    ProviderError,
    RateLimitedError,
    TimeoutError,
)

__all__ = [
    "BaseProvider",
    "AIError",
    "NotConfiguredError",
    "RateLimitedError",
    "InvalidOutputError",
    "TimeoutError",
    "ProviderError",
    "get_provider",
    "compile_semantic_slide",
    "repair_content_limits",
]
