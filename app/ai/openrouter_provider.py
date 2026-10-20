"""OpenRouter Provider with JSON parsing and repair pass per Section 4.5."""

import json
import re
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


def extract_json(text: str) -> Any:
    """Robust JSON extraction from LLM prose or code fences."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try extracting markdown fence ```json ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass

    # Try finding first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    raise InvalidOutputError(f"Could not extract valid JSON from response: {text[:100]}...")


class OpenRouterProvider(BaseProvider):
    """OpenRouter provider for development and multi-model fallbacks."""

    def __init__(self):
        self.api_key = Config.OPENROUTER_API_KEY
        self.model = Config.OPENROUTER_MODEL or "anthropic/claude-3.7-sonnet"
        self.endpoint = f"{Config.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _call(self, system: str, prompt: str) -> Any:
        if not self.is_configured:
            raise NotConfiguredError(
                "OpenRouter API key is not configured. Add OPENROUTER_API_KEY in .env."
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://fluxa.local",
            "X-Title": "FLUXA Presentation Editor",
        }

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        try:
            resp = requests.post(self.endpoint, headers=headers, json=payload, timeout=45)
        except requests.Timeout:
            raise TimeoutError("The OpenRouter request timed out after 45 seconds.")
        except requests.RequestException as e:
            raise ProviderError(f"Network error communicating with OpenRouter: {e}")

        if resp.status_code == 429:
            raise RateLimitedError("OpenRouter rate limit reached. Please wait a moment.")
        if resp.status_code >= 500:
            raise ProviderError(f"OpenRouter upstream server error ({resp.status_code}).")
        if resp.status_code != 200:
            raise ProviderError(f"OpenRouter API error: {resp.text}")

        try:
            data = resp.json()
            raw_content = data["choices"][0]["message"]["content"]
            return extract_json(raw_content)
        except Exception as e:
            raise InvalidOutputError(f"Failed to parse OpenRouter response: {e}")

    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        system = (
            "You are an expert presentation architect. Output pure JSON with keys: "
            "'title' (string, <=70 chars) and 'slides' (array of objects with 'title', "
            "'layout', 'purpose', 'visual'). "
            "Layouts must be one of: title, bullets, two-column, big-number, chart-text, "
            "quote, timeline, comparison. Visuals: chart, kpi, timeline, comparison, quote, none."
        )
        prompt = (
            f"Topic: {topic}\nSlide Count: {slide_count}\n"
            f"Audience: {audience}\nLanguage: {language}\n"
            "Respond in valid JSON only."
        )
        data = self._call(system, prompt)
        if not isinstance(data, dict) or "slides" not in data:
            raise InvalidOutputError("Outline JSON missing 'slides' array.")
        return data

    def generate_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        system = (
            "You are a slide author. Output pure JSON for the slide with keys: "
            "'title' (<=70 chars), 'subtitle' (optional), 'bullets' (up to 5 items, <=90 chars each), "
            "'notes' (speaker notes string), and optional visual block ('chart', 'kpi', 'timeline', 'quote')."
        )
        prompt = (
            f"Deck Title: {deck_context.get('title', '')}\n"
            f"Slide Title: {outline_item.get('title', '')}\n"
            f"Layout: {outline_item.get('layout', 'bullets')}\n"
            f"Purpose: {outline_item.get('purpose', '')}\n"
            f"Visual: {outline_item.get('visual', 'none')}\n"
            "Respond in valid JSON only."
        )
        data = self._call(system, prompt)
        data["layout"] = outline_item.get("layout", "bullets")
        return data

    def chat_ops(
        self,
        message: str,
        current_slide: Dict[str, Any],
        deck_context: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        system = (
            "You are FLUXA's editor copilot. Return JSON with 'message' (short explanation) "
            "and 'ops' (array of operations: set_block_props, add_block, remove_block, "
            "set_dataset, add_variable, apply_layout, set_notes)."
        )
        context = {
            "current_slide": current_slide,
            "datasets": deck_context.get("datasets", {}),
            "variables": deck_context.get("variables", {}),
        }
        prompt = f"Context: {json.dumps(context)}\nUser request: {message}\nReturn valid JSON."
        data = self._call(system, prompt)
        return data.get("message", "Updated presentation."), data.get("ops", [])
