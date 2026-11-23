"""OpenAI Provider for GPT-4o, GPT-4o-mini and OpenAI-compatible endpoints per Section 4.5."""

import json
from typing import Any, Dict, List, Tuple

import requests

from app.ai.gemini_provider import COPILOT_OPS_SCHEMA_PROMPT
from app.ai.openrouter_provider import extract_json
from app.ai.provider import (
    BaseProvider,
    InvalidOutputError,
    NotConfiguredError,
    ProviderError,
    RateLimitedError,
    TimeoutError,
)
from app.config import Config


class OpenAIProvider(BaseProvider):
    """OpenAI and OpenAI-compatible provider."""

    def __init__(self):
        self.api_key = Config.OPENAI_API_KEY
        self.model = Config.OPENAI_MODEL or "gpt-4o-mini"
        self.endpoint = f"{Config.OPENAI_BASE_URL.rstrip('/')}/chat/completions"

    @property
    def name(self) -> str:
        return "openai"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _call(self, system: str, prompt: str, history: List[Dict[str, Any]] = None) -> Any:
        if not self.is_configured:
            raise NotConfiguredError(
                "OpenAI API key is not configured. Add OPENAI_API_KEY in .env."
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = []
        if system:
            messages.append({"role": "system", "content": system})

        if history:
            for h in history[-8:]:
                messages.append(
                    {
                        "role": "user" if h.get("role") == "user" else "assistant",
                        "content": h.get("content", ""),
                    }
                )

        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        try:
            resp = requests.post(self.endpoint, headers=headers, json=payload, timeout=45)
            # If model does not support response_format json_object, retry without it
            if resp.status_code == 400 and "response_format" in resp.text:
                del payload["response_format"]
                resp = requests.post(self.endpoint, headers=headers, json=payload, timeout=45)
        except requests.Timeout:
            raise TimeoutError("The OpenAI request timed out after 45 seconds.")
        except requests.RequestException as e:
            raise ProviderError(f"Network error communicating with OpenAI: {e}")

        if resp.status_code == 429:
            raise RateLimitedError("OpenAI rate limit reached. Please wait a moment.")
        if resp.status_code >= 500:
            raise ProviderError(f"OpenAI upstream server error ({resp.status_code}).")
        if resp.status_code != 200:
            raise ProviderError(f"OpenAI API error: {resp.text}")

        try:
            data = resp.json()
            raw_content = data["choices"][0]["message"]["content"]
            return extract_json(raw_content)
        except Exception as e:
            raise InvalidOutputError(f"Failed to parse OpenAI response: {e}")

    def complete_json(self, system: str, user: str, max_tokens: int = 1500) -> Any:
        return self._call(system, user)

    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        system = (
            "You are a master presentation designer. Create a compelling, professional, "
            "deeply engaging presentation outline with real domain insights. Avoid generic placeholder text.\n"
            "Output pure JSON with keys:\n"
            "- 'title': concise presentation title (<= 70 chars)\n"
            "- 'slides': array of objects, each containing:\n"
            "    'title': specific, impactful slide headline (<= 70 chars)\n"
            "    'layout': one of 'title', 'bullets', 'two-column', 'big-number', 'chart-text', 'quote', 'timeline', 'comparison'\n"
            "    'purpose': clear takeaway sentence\n"
            "    'visual': one of 'chart', 'kpi', 'timeline', 'comparison', 'quote', 'none'"
        )
        prompt = (
            f"Topic: {topic}\nSlide Count: {slide_count}\n"
            f"Audience: {audience}\nLanguage: {language}\n"
            f"Provide an outline with exactly {slide_count} varied, non-repetitive slides."
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
            "You are an expert presentation content author. Generate rich, substantive, data-driven "
            "content for this slide. Follow strict constraints:\n"
            "- 'title': concise headline (<= 70 chars)\n"
            "- 'subtitle': optional sub-headline (<= 100 chars)\n"
            "- 'bullets': 3 to 5 clear, insightful points (<= 90 chars each)\n"
            "- 'notes': informative speaker talking points\n"
            "- Visual block based on layout:\n"
            "  * If layout is 'chart-text' or visual is 'chart': include 'chart' object with 'kind' ('bar'|'line'|'pie'|'doughnut'), 'title', and 'data' array with 4-8 realistic data objects.\n"
            "  * If layout is 'big-number' or visual is 'kpi': include 'kpi' object with 'value' (e.g. 87% or $4.2M), 'label', 'delta' (e.g. '+24% YoY').\n"
            "  * If layout is 'timeline' or visual is 'timeline': include 'timeline' object with 'steps' array of 3-4 phase objects with 'step', 'title', 'desc'.\n"
            "  * If layout is 'comparison' or visual is 'comparison': include 'comparison' object with 'leftTitle', 'leftItems' (array), 'rightTitle', 'rightItems' (array).\n"
            "  * If layout is 'quote' or visual is 'quote': include 'quote' object with 'text' and 'author'."
        )
        prompt = (
            f"Presentation: {deck_context.get('title', '')}\n"
            f"Slide Title: {outline_item.get('title', '')}\n"
            f"Layout: {outline_item.get('layout', 'bullets')}\n"
            f"Purpose: {outline_item.get('purpose', '')}\n"
            f"Visual: {outline_item.get('visual', 'none')}\n"
            "Return valid JSON only."
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
        context = {
            "current_slide": current_slide,
            "datasets": deck_context.get("datasets", {}),
            "variables": deck_context.get("variables", {}),
        }
        prompt = (
            f"Presentation Context: {json.dumps(context, ensure_ascii=False)}\n\n"
            f"User Instruction: {message}\n\n"
            "Translate this instruction into appropriate ops to modify the slide or deck."
        )
        data = self._call(COPILOT_OPS_SCHEMA_PROMPT, prompt, history)
        return data.get("message", "Updated slide."), data.get("ops", [])
