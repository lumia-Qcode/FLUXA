"""Google Gemini Provider using Gemini REST API per Section 4.5."""

import json
from typing import Any, Dict, List, Tuple

import requests

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

COPILOT_OPS_SCHEMA_PROMPT = """
You are FLUXA Copilot, an expert AI presentation designer and co-author.
Given the current slide and context, understand the user request and return atomic operations (ops) to modify the deck.
Allowed operations (ops):
1. Adding a Chart (Pie / Donut / Bar / Line / 3D):
   {"op": "add_block", "block": {"type": "chart", "kind": "pie", "is3D": true, "x": 1000, "y": 220, "w": 820, "h": 680, "props": {"kind": "pie", "is3D": true, "title": "Distribution", "labels": ["Category A", "Category B", "Category C"], "values": [45, 35, 20]}}}
2. set_block_props: modify properties of an existing block.
   {"op": "set_block_props", "block_id": "<block_id>", "props": {"text": "...", "bullets": ["..."], "title": "..."}}
3. add_block: add a new block to the slide (text, chart, kpi, timeline, quote, etc.).
   {"op": "add_block", "block": {"id": "blk-...", "type": "text"|"chart"|"kpi"|"timeline"|"quote", "x": 1000, "y": 240, "w": 800, "h": 500, "props": {...}}}
4. remove_block: delete a block by id.
   {"op": "remove_block", "block_id": "<block_id>"}
5. apply_layout: change layout.
   {"op": "apply_layout", "layout": "title"|"bullets"|"two-column"|"big-number"|"chart-text"|"image-text"|"quote"|"timeline"|"comparison"|"section"}
6. apply_theme: change deck theme.
   {"op": "apply_theme", "theme_id": "editorial"|"midnight"|"frost"|"minimal"|"sunset"|"terminal"}
7. set_notes: update speaker notes ONLY when user explicitly asks for speaker notes. NEVER use set_notes for chart or slide changes!
   {"op": "set_notes", "notes": "..."}
8. add_slide: add a new slide.
   {"op": "add_slide", "slide": {"id": "slide-new", "order": 99, "title": "...", "layout": "bullets", "blocks": [...]}}
9. remove_slide: remove current slide.
   {"op": "remove_slide", "slide_id": "<slide_id>"}

CRITICAL RULES:
- When asked to add or change a chart (pie chart, 3D chart, donut, bar, line), NEVER use 'set_notes' to write an action plan! Always return 'add_block' with type: "chart", kind: "pie" (or requested type), is3D: true, and relevant labels and values.
- If user asks a conversational question without requesting edits, return ops: [] and explain in message.

You must return valid JSON with:
{
  "message": "Concise 1-2 sentence description of what was changed or answered.",
  "ops": [ ...array of operation objects... ]
}
"""


class GeminiProvider(BaseProvider):
    """Google Gemini provider using Gemini REST API."""

    def __init__(self):
        self.api_key = Config.GEMINI_API_KEY
        self.model = Config.GEMINI_MODEL or "gemini-2.5-flash"
        self.endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        )

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _call(self, system: str, prompt: str, history: List[Dict[str, Any]] = None) -> Any:
        if not self.is_configured:
            raise NotConfiguredError(
                "Gemini API key is not configured. Add GEMINI_API_KEY in .env."
            )

        url = f"{self.endpoint}?key={self.api_key}"

        contents = []
        if history:
            for h in history[-8:]:
                role = "user" if h.get("role") == "user" else "model"
                contents.append({"role": role, "parts": [{"text": h.get("content", "")}]})

        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        try:
            resp = requests.post(
                url, headers={"Content-Type": "application/json"}, json=payload, timeout=45
            )
        except requests.Timeout:
            raise TimeoutError("The Gemini request timed out after 45 seconds.")
        except requests.RequestException as e:
            raise ProviderError(f"Network error communicating with Gemini: {e}")

        if resp.status_code == 429:
            raise RateLimitedError("Gemini rate limit reached. Please wait a moment.")
        if resp.status_code >= 500:
            raise ProviderError(f"Gemini upstream server error ({resp.status_code}).")
        if resp.status_code != 200:
            raise ProviderError(f"Gemini API error: {resp.text}")

        try:
            data = resp.json()
            raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
            return extract_json(raw_content)
        except Exception as e:
            raise InvalidOutputError(f"Failed to parse Gemini response: {e}")

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
