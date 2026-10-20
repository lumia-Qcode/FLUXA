"""Anthropic Claude Provider using Messages API with forced tool use per Section 4.5."""

import json
from typing import Any, Dict, List, Tuple

import requests

from app.ai.provider import (
    BaseProvider,
    InvalidOutputError,
    NotConfiguredError,
    ProviderError,
    RateLimitedError,
    TimeoutError,
)
from app.config import Config

OUTLINE_TOOL = {
    "name": "generate_outline",
    "description": "Output the presentation title and slide intents list.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short deck title <= 70 chars"},
            "slides": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "layout": {
                            "type": "string",
                            "enum": [
                                "title",
                                "bullets",
                                "two-column",
                                "big-number",
                                "chart-text",
                                "image-text",
                                "quote",
                                "timeline",
                                "comparison",
                                "section",
                                "full-bleed",
                            ],
                        },
                        "purpose": {"type": "string"},
                        "visual": {
                            "type": "string",
                            "enum": [
                                "chart",
                                "kpi",
                                "timeline",
                                "comparison",
                                "quote",
                                "none",
                                "widget",
                            ],
                        },
                    },
                    "required": ["title", "layout", "purpose", "visual"],
                },
            },
        },
        "required": ["title", "slides"],
    },
}

SLIDE_TOOL = {
    "name": "generate_slide",
    "description": "Output the semantic content slots for a single slide.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Concise headline <= 70 chars"},
            "subtitle": {"type": "string"},
            "bullets": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Up to 5 concise points <= 90 chars each",
            },
            "chart": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["bar", "line", "pie", "doughnut"]},
                    "title": {"type": "string"},
                    "dataset": {"type": "string"},
                    "xField": {"type": "string"},
                    "yField": {"type": "string"},
                    "data": {"type": "array", "items": {"type": "object"}},
                },
            },
            "kpi": {
                "type": "object",
                "properties": {
                    "value": {"type": ["number", "string"]},
                    "label": {"type": "string"},
                    "delta": {"type": "string"},
                },
            },
            "quote": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "author": {"type": "string"},
                },
            },
            "notes": {"type": "string", "description": "Actionable speaker notes"},
        },
        "required": ["title"],
    },
}

CHAT_OPS_TOOL = {
    "name": "execute_chat_ops",
    "description": "Output assistant explanation and atomic operations modifying the deck.",
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {"type": "string", "description": "Concise conversational response"},
            "ops": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "op": {
                            "type": "string",
                            "enum": [
                                "set_block_props",
                                "add_block",
                                "remove_block",
                                "set_dataset",
                                "set_dataset_cell",
                                "add_variable",
                                "add_slide",
                                "remove_slide",
                                "reorder_slides",
                                "apply_layout",
                                "apply_theme",
                                "set_animation",
                                "set_notes",
                            ],
                        },
                        "block_id": {"type": "string"},
                        "props": {"type": "object"},
                        "layout": {"type": "string"},
                        "notes": {"type": "string"},
                        "variable": {"type": "object"},
                        "dataset": {"type": "string"},
                    },
                    "required": ["op"],
                },
            },
        },
        "required": ["message", "ops"],
    },
}


class AnthropicProvider(BaseProvider):
    """Anthropic Claude provider using forced tool calls."""

    def __init__(self):
        self.api_key = Config.ANTHROPIC_API_KEY
        self.model = Config.ANTHROPIC_MODEL or "claude-3-7-sonnet-20250219"
        self.endpoint = "https://api.anthropic.com/v1/messages"

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _call(self, system: str, messages: list, tools: list, forced_tool: str) -> Dict[str, Any]:
        if not self.is_configured:
            raise NotConfiguredError(
                "Anthropic API key is not configured. Add ANTHROPIC_API_KEY in .env."
            )

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        payload = {
            "model": self.model,
            "max_tokens": 4096,
            "system": system,
            "messages": messages,
            "tools": tools,
            "tool_choice": {"type": "tool", "name": forced_tool},
        }

        try:
            resp = requests.post(self.endpoint, headers=headers, json=payload, timeout=45)
        except requests.Timeout:
            raise TimeoutError("The Anthropic API request timed out after 45 seconds.")
        except requests.RequestException as e:
            raise ProviderError(f"Network error communicating with Anthropic: {e}")

        if resp.status_code == 429:
            raise RateLimitedError("Anthropic rate limit exceeded. Please wait a moment.")
        if resp.status_code >= 500:
            raise ProviderError(f"Anthropic server error ({resp.status_code}).")
        if resp.status_code != 200:
            raise ProviderError(f"Anthropic API error: {resp.text}")

        try:
            data = resp.json()
            for block in data.get("content", []):
                if block.get("type") == "tool_use" and block.get("name") == forced_tool:
                    return block.get("input", {})
            raise InvalidOutputError("The model did not return the expected tool call output.")
        except Exception as e:
            raise InvalidOutputError(f"Failed to parse Anthropic response: {e}")

    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        system = (
            "You are an expert presentation architect. Create structured outlines for web-native "
            "interactive slides. Ensure at least one third of slides have a visual (chart, kpi, timeline). "
            f"Language: {language}. Audience: {audience}."
        )
        prompt = f"Topic: {topic}\nSlide Count: {slide_count}"
        messages = [{"role": "user", "content": prompt}]
        return self._call(system, messages, [OUTLINE_TOOL], "generate_outline")

    def generate_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        system = (
            "You are an expert presentation content author. Generate concise semantic slide content. "
            "Follow strict constraints: title <= 70 chars, at most 5 bullets, each bullet <= 90 chars. "
            "If generating chart data, invent realistic figures and provide 4 to 8 points."
        )
        prompt = (
            f"Deck Title: {deck_context.get('title', '')}\n"
            f"Slide Title: {outline_item.get('title', '')}\n"
            f"Layout: {outline_item.get('layout', 'bullets')}\n"
            f"Purpose: {outline_item.get('purpose', '')}\n"
            f"Visual: {outline_item.get('visual', 'none')}"
        )
        messages = [{"role": "user", "content": prompt}]
        res = self._call(system, messages, [SLIDE_TOOL], "generate_slide")
        res["layout"] = outline_item.get("layout", "bullets")
        return res

    def chat_ops(
        self,
        message: str,
        current_slide: Dict[str, Any],
        deck_context: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        system = (
            "You are FLUXA's presentation editor copilot. Return atomic operations (ops) to modify "
            "the deck. Keep assistant messages concise, active, and sentence-case. Never use "
            "'Would you like any further changes?'. Never use marketing fluff."
        )
        context_str = json.dumps(
            {
                "current_slide": current_slide,
                "datasets": deck_context.get("datasets", {}),
                "variables": deck_context.get("variables", {}),
                "outline": deck_context.get("outline", []),
            }
        )
        user_content = f"Context:\n{context_str}\n\nUser request: {message}"
        messages = [{"role": "user", "content": user_content}]
        res = self._call(system, messages, [CHAT_OPS_TOOL], "execute_chat_ops")
        return res.get("message", "Updated presentation."), res.get("ops", [])
