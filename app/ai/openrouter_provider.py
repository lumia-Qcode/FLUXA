"""OpenRouter Provider with multi-model fallback, JSON repair pass, and graceful degradation."""

import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.ai import gateway
from app.prompts.features import role_rule
from app.prompts.registry import call_prompt
from app.ai.bilingual import ROMAN_URDU_SYSTEM_PROMPT, MIXED_SYSTEM_PROMPT, build_bilingual_system_prompt
from app.ai.designer_agent import ExecutiveDesignerAgent
from app.ai.mock_provider import MockProvider
from app.ai.provider import (
    BaseProvider,
    InvalidOutputError,
    NotConfiguredError,
    ProviderError,
    RateLimitedError,
    TimeoutError,
)
from app.config import Config

logger = logging.getLogger(__name__)

# Extra output tokens for the reasoning trace of the free reasoning models.
REASONING_HEADROOM = 4096
REQUEST_TIMEOUT_S = 90
# Interactive features wait less per model before the next configured route is tried: a free
# model that stalls for 90 s left the Copilot panel apparently doing nothing (AGENTS.md: 45 s).
INTERACTIVE_TIMEOUT_S = {"copilot.chat": 45, "slide.enhance": 45, "audience.ask": 45, "captions.translate": 45}


def extract_json(text: Any) -> Any:
    """Robust JSON extraction from LLM prose, code fences, trailing commas, or truncated outputs."""
    if text is None:
        raise InvalidOutputError("LLM response content was empty/null.")
    if not isinstance(text, str):
        text = str(text)

    text = text.strip()
    if not text:
        raise InvalidOutputError("LLM response content was empty.")

    # 1. Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # 2. Extract from markdown code fence ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    candidate = fence_match.group(1).strip() if fence_match else text

    # Try direct parse on fenced content
    try:
        return json.loads(candidate)
    except Exception:
        pass

    # 3. Strip trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([\]}])", r"\1", candidate)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # 4. Find first { or [ and last } or ]
    start_brace = cleaned.find("{")
    start_bracket = cleaned.find("[")

    start = -1
    if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
        start = start_brace
        end = cleaned.rfind("}")
    elif start_bracket != -1:
        start = start_bracket
        end = cleaned.rfind("]")
    else:
        end = -1

    if start != -1:
        if end != -1 and end > start:
            sub = cleaned[start : end + 1]
            sub_cleaned = re.sub(r",\s*([\]}])", r"\1", sub)
            try:
                return json.loads(sub_cleaned)
            except Exception:
                pass

        # 5. Handle truncated JSON (unclosed brackets/braces from token limit)
        partial = cleaned[start:]
        open_braces = 0
        open_brackets = 0
        in_string = False
        escape = False
        for char in partial:
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if not in_string:
                if char == "{":
                    open_braces += 1
                elif char == "}":
                    open_braces = max(0, open_braces - 1)
                elif char == "[":
                    open_brackets += 1
                elif char == "]":
                    open_brackets = max(0, open_brackets - 1)

        repaired = partial
        if in_string:
            repaired += '"'
        repaired = re.sub(r",\s*$", "", repaired.strip())
        repaired += ("]" * open_brackets) + ("}" * open_braces)
        repaired = re.sub(r",\s*([\]}])", r"\1", repaired)
        try:
            return json.loads(repaired)
        except Exception:
            pass

    # 6. Try ast.literal_eval for single-quoted Python dicts
    try:
        import ast

        val = ast.literal_eval(text)
        if isinstance(val, (dict, list)):
            return val
    except Exception:
        pass

    raise InvalidOutputError(f"Could not extract valid JSON from response: {text[:120]}...")


GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

# Backends whose daily free quota is used up: key -> UTC timestamp when to try again.
# OpenRouter's free-model limit is per account, so its key is the backend name;
# Gemini's is per model, so its key is "gemini:<model>".
_EXHAUSTED_UNTIL: Dict[str, float] = {}


def _next_utc_midnight(now: Optional[float] = None) -> float:
    now = time.time() if now is None else now
    day = datetime.fromtimestamp(now, tz=timezone.utc).date() + timedelta(days=1)
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp()


def _is_daily_quota_error(body: str) -> bool:
    text = (body or "").lower()
    return "per-day" in text or "perday" in text or "per day" in text or "free-models-per-day" in text



def _block_text(b: Dict[str, Any]) -> str:
    """The text a block shows, from whichever field holds it (bullets, rich text, content, props)."""
    props = b.get("props") or {}
    bullets = b.get("bullets") or props.get("bullets")
    if isinstance(bullets, list) and bullets:
        return "\n".join(f"- {x if isinstance(x, str) else (x or {}).get('text', '')}" for x in bullets)
    doc = b.get("doc")
    if isinstance(doc, dict) and doc.get("content"):
        parts = []

        def walk(node):
            if isinstance(node, dict):
                if node.get("type") == "text":
                    parts.append(node.get("text", ""))
                for child in node.get("content") or []:
                    walk(child)
                if node.get("type") in ("paragraph", "heading", "listItem"):
                    parts.append("\n")

        walk(doc)
        return "".join(parts).strip()
    return str(b.get("content") or props.get("text") or b.get("text") or props.get("label") or props.get("value") or "")


def summarize_block(b: Dict[str, Any], datasets: Dict[str, Any]) -> Dict[str, Any]:
    """Compact view of a block for the Copilot prompt."""
    props = b.get("props") or {}
    out: Dict[str, Any] = {"id": b.get("id"), "type": b.get("type"), "role": b.get("role")}
    for k in ("x", "y", "w", "h"):
        v = b.get(k, (b.get("box") or {}).get(k))
        if isinstance(v, (int, float)):
            out[k] = v
    text = _block_text(b)
    if text:
        out["text"] = text[:600]
    style = b.get("style") or props.get("style")
    if isinstance(style, dict):
        out["style"] = {k: style[k] for k in ("fontSize", "fontWeight", "color", "align") if k in style}
    if b.get("type") == "chart":
        out["kind"] = b.get("kind") or props.get("kind")
        labels = b.get("labels") or props.get("labels")
        values = b.get("values") or props.get("values")
        ds = datasets.get(b.get("dataset") or props.get("dataset") or "")
        if not labels and isinstance(ds, dict):
            x = b.get("xField") or props.get("xField") or "label"
            y = b.get("yField") or props.get("yField") or "value"
            rows = ds.get("rows") or []
            labels = [r.get(x) for r in rows][:12]
            values = [r.get(y) for r in rows][:12]
        out["labels"], out["values"] = labels, values
        out["title"] = props.get("title") or b.get("title")
    if b.get("type") == "image":
        out["model3d"] = b.get("model3d") or props.get("model3d")
        sf = b.get("sketchfab") or props.get("sketchfab")
        if isinstance(sf, dict):
            out["sketchfab"] = sf.get("name")
    if b.get("type") == "kpi":
        out["value"], out["label"] = props.get("value") or b.get("value"), props.get("label") or b.get("label")
    return out

class OpenRouterProvider(BaseProvider):
    """Free-model provider: OpenRouter's free models plus Google Gemini's free tier.

    Each request walks an ordered list of routes (backend + model) until one answers.
    A route whose daily free quota is spent is skipped until the quota resets, so one
    exhausted backend doesn't cost a failed call on every request.
    """

    def __init__(self):
        self.api_key = Config.OPENROUTER_API_KEY
        self.gemini_api_key = Config.GEMINI_API_KEY
        self.endpoint = f"{Config.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
        self._fallback_provider = MockProvider()

        configured = [
            m.strip()
            for m in [Config.OPENROUTER_MODEL, Config.OPENROUTER_FALLBACK_MODEL]
            if m and m.strip()
        ]
        # Free models only (no OpenRouter credits). Main model is the strongest free one;
        # the rest are tried in order only when it fails (free endpoints often rate-limit
        # with 429). openrouter/free is the last resort. Benchmarked 2026-11-21.
        defaults = [
            "nvidia/nemotron-3-ultra-550b-a55b:free",
            "baidu/ernie-5.5-flash-preview:free",
            "nvidia/nemotron-3.5-super-vl:free",
            "google/gemma-4-31b-it:free",
            "openrouter/free",
        ]
        self.models: List[str] = []
        for m in configured + defaults:
            if m and m not in self.models:
                self.models.append(m)

        self.gemini_models: List[str] = []
        if self.gemini_api_key and self.gemini_api_key.strip():
            for m in [Config.GEMINI_MODEL, Config.GEMINI_FALLBACK_MODEL]:
                if m and m.strip() and m.strip() not in self.gemini_models:
                    self.gemini_models.append(m.strip())

        self.routes = self._build_routes()
        self.designer_agent = ExecutiveDesignerAgent(self)
        self._last_dossier: Optional[Dict[str, Any]] = None

    def _build_routes(self) -> List[Dict[str, str]]:
        """Order: OpenRouter main model, then Gemini, then the other OpenRouter models."""
        openrouter = [{"backend": "openrouter", "model": m} for m in self.models] if self._has(self.api_key) else []
        gemini = [{"backend": "gemini", "model": m} for m in self.gemini_models]
        return openrouter[:1] + gemini + openrouter[1:]

    @staticmethod
    def _has(key: Optional[str]) -> bool:
        return bool(key and key.strip())

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def is_configured(self) -> bool:
        return bool(self.routes)

    # -- transport --------------------------------------------------------------------

    @staticmethod
    def _quota_key(route: Dict[str, str]) -> str:
        return "openrouter" if route["backend"] == "openrouter" else f"gemini:{route['model']}"

    def _available_routes(self) -> List[Dict[str, str]]:
        now = time.time()
        return [r for r in self.routes if _EXHAUSTED_UNTIL.get(self._quota_key(r), 0) <= now]

    def _request(self, route: Dict[str, str], payload: Dict[str, Any]) -> requests.Response:
        if route["backend"] == "gemini":
            url = f"{GEMINI_OPENAI_BASE_URL}/chat/completions"
            headers = {"Authorization": f"Bearer {self.gemini_api_key.strip()}", "Content-Type": "application/json"}
            body = dict(payload)
            # Gemini's OpenAI-compatible API takes reasoning_effort, not OpenRouter's reasoning object.
            body.pop("reasoning", None)
            body["reasoning_effort"] = payload.get("reasoning", {}).get("effort", "medium")
        else:
            url = self.endpoint
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fluxa.local",
                "X-Title": "FLUXA Presentation Editor",
            }
            body = payload
        timeout = INTERACTIVE_TIMEOUT_S.get(gateway.current_feature(), REQUEST_TIMEOUT_S)
        return requests.post(url, headers=headers, json=body, timeout=timeout)

    def _note_rate_limit(self, route: Dict[str, str], resp: requests.Response) -> RateLimitedError:
        label = f"{route['backend']} {route['model']}"
        if _is_daily_quota_error(resp.text):
            until = _next_utc_midnight()
            try:  # OpenRouter reports the exact reset time (ms) in the error metadata
                reset_ms = resp.json()["error"]["metadata"]["headers"]["X-RateLimit-Reset"]
                until = int(reset_ms) / 1000
            except Exception:
                pass
            _EXHAUSTED_UNTIL[self._quota_key(route)] = until
            logger.warning("%s: daily free quota used up; skipping it until it resets.", label)
            return RateLimitedError(f"{label} daily free quota is used up.")
        return RateLimitedError(f"{label} was rate-limited (429).")

    def _send(
        self,
        messages: List[Dict[str, Any]],
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        json_mode: bool = False,
    ) -> Dict[str, Any]:
        """Send one chat turn, walking the routes. Returns the assistant message dict."""
        routes = self._available_routes()
        if not routes:
            if not self.routes:
                raise NotConfiguredError("No AI key is configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY in .env.")
            raise RateLimitedError("Every free AI backend has used up its daily quota. It resets at midnight UTC.")

        last_error: Optional[Exception] = None
        for route in routes:
            if _EXHAUSTED_UNTIL.get(self._quota_key(route), 0) > time.time():
                continue  # marked exhausted by an earlier route in this same request
            label = f"{route['backend']} {route['model']}"
            for try_json_mode in ((True, False) if json_mode else (False,)):
                payload: Dict[str, Any] = {
                    "model": route["model"],
                    "messages": messages,
                    "temperature": 0.2,
                    # The free models are reasoning models: thinking tokens count against
                    # max_tokens, so add headroom or the answer gets cut off.
                    "max_tokens": max_tokens + REASONING_HEADROOM,
                    "reasoning": {"effort": gateway.effort(), "exclude": True},
                }
                if tools:
                    payload["tools"] = tools
                if try_json_mode:
                    payload["response_format"] = {"type": "json_object"}

                started = time.time()
                try:
                    resp = self._request(route, payload)
                except requests.Timeout:
                    gateway.record(label, "timeout", total_ms=(time.time() - started) * 1000)
                    last_error = TimeoutError(f"{label} timed out.")
                    break
                except requests.RequestException as e:
                    gateway.record(label, "network_error", total_ms=(time.time() - started) * 1000)
                    last_error = ProviderError(f"Network error with {label}: {e}")
                    break
                elapsed_ms = (time.time() - started) * 1000
                if resp.status_code != 200 and not (resp.status_code == 400 and try_json_mode):
                    gateway.record(label, f"http_{resp.status_code}", total_ms=elapsed_ms)

                if resp.status_code == 400 and try_json_mode:
                    continue  # some models reject response_format; retry without it
                if resp.status_code == 429:
                    last_error = self._note_rate_limit(route, resp)
                    break
                if resp.status_code == 403 and route["backend"] == "gemini" and "free tier is not available" in resp.text:
                    # The Google project isn't eligible for the free tier: every Gemini model will
                    # refuse, so stop trying Gemini for a day instead of failing on each request.
                    for r in self.routes:
                        if r["backend"] == "gemini":
                            _EXHAUSTED_UNTIL[self._quota_key(r)] = time.time() + 24 * 3600
                    logger.warning("Gemini free tier is not available for this Google project; skipping Gemini.")
                    last_error = ProviderError("Gemini free tier is not available for this Google project (billing required).")
                    break
                if resp.status_code != 200:
                    last_error = ProviderError(f"{label} error ({resp.status_code}): {resp.text[:100]}")
                    break
                try:
                    data = resp.json()
                    choices = data.get("choices") or []
                    msg = (choices[0].get("message") or {}) if choices else {}
                except Exception as e:
                    gateway.record(label, "bad_response", total_ms=elapsed_ms)
                    last_error = InvalidOutputError(f"Bad response from {label}: {e}")
                    break
                gateway.record(
                    label,
                    "ok" if (msg.get("tool_calls") or msg.get("content")) else "empty",
                    usage=data.get("usage") if isinstance(data, dict) else None,
                    total_ms=elapsed_ms,
                )
                if msg.get("tool_calls") or msg.get("content"):
                    # Only the answer counts: the reasoning trace is never used as content.
                    return {
                        "content": msg.get("content") or "",
                        "tool_calls": msg.get("tool_calls") or [],
                        "route": label,
                    }
                last_error = InvalidOutputError(f"{label} returned an empty message.")
                break

            logger.warning("%s failed, trying the next one: %s", label, str(last_error)[:160])

        logger.warning("All AI routes failed. Last error: %s", last_error)
        raise last_error or ProviderError("All configured AI routes failed.")

    def _call(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 1500,
        history: List[Dict[str, Any]] = None,
    ) -> Any:
        """Ask for a JSON answer. A route whose reply isn't valid JSON counts as failed."""
        messages: List[Dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        for h in (history or [])[-8:]:
            messages.append(
                {"role": "user" if h.get("role") == "user" else "assistant", "content": h.get("content", "")}
            )
        messages.append({"role": "user", "content": prompt})

        msg = self._send(messages, max_tokens, json_mode=True)
        try:
            return extract_json(msg["content"])
        except InvalidOutputError as first_error:
            # One retry on the remaining routes, so a single bad reply doesn't end the request.
            logger.warning("%s returned invalid JSON, retrying once: %s", msg.get("route"), first_error)
            retry = self._send(messages, max_tokens, json_mode=True)
            return extract_json(retry["content"])

    def complete_json(self, system: str, user: str, max_tokens: int = 1500) -> Any:
        return self._call(system, user, max_tokens=max_tokens)

    def chat_message(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 3000,
    ) -> Dict[str, Any]:
        """One chat turn that may return tool calls (used by app/ai/tool_loop.py)."""
        return self._send(messages, max_tokens, tools=tools)

    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        """Research the topic, then outline the deck from the evidence (no template fallback)."""
        result = self.designer_agent.research_and_create_outline(
            topic, slide_count=slide_count, audience=audience, language=language
        )
        self._last_dossier = result.get("research_dossier")
        return result

    def generate_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """One slide grounded in the deck's research (quotes the sources if the model fails)."""
        return self.designer_agent.design_slide(outline_item, deck_context, dossier=self._last_dossier)

    def chat_ops(
        self,
        message: str,
        current_slide: Dict[str, Any],
        deck_context: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
        language: str = "en",
        role: str = "",
        selection: str = "",
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Execute a copilot chat command and return (reply_text, ops_list).

        Args:
            message: User's raw message.
            current_slide: Current slide spec dict.
            deck_context: Deck-level metadata (title, datasets, variables).
            history: Recent chat history.
            language: Detected language code ('en', 'roman_urdu', 'mixed').
        """
        # What is actually on the slide: visible text, chart data, position and size per block.
        datasets = (deck_context or {}).get("datasets") or {}
        blocks_summary = [summarize_block(b, datasets) for b in current_slide.get("blocks", []) if isinstance(b, dict)]
        compact_slide = {
            "id": current_slide.get("id"),
            "title": current_slide.get("title", "") or next((s.get("text") for s in blocks_summary if s.get("role") == "title"), ""),
            "layout": current_slide.get("layout", ""),
            "notes": (current_slide.get("notes") or "")[:300],
            "blocks": blocks_summary,
        }
        deck_outline = json.dumps((deck_context or {}).get("slides") or [])

        # Bilingual system-prompt injection
        bilingual_section = build_bilingual_system_prompt(language)

        # Language-specific reply instruction
        if language == "roman_urdu":
            lang_reply_rule = (
                "REPLY LANGUAGE: The user wrote in Roman Urdu. Reply in Roman Urdu. "
                "Translate the intent to English internally to build ops, then write your 'message' in Roman Urdu."
            )
        elif language == "mixed":
            lang_reply_rule = (
                "REPLY LANGUAGE: The user used mixed English and Roman Urdu. "
                "Reply in English unless the message is predominantly Roman Urdu."
            )
        else:
            lang_reply_rule = "REPLY LANGUAGE: Reply in clear, professional English."


        # No canned fallback: when the model fails, the user is told nothing changed (a demo
        # edit from the mock provider used to be applied instead, which looked like a wrong edit).
        data = call_prompt(
            self,
            "copilot.ops",
            history=history or [],
            role_rule=role_rule(role) or "ACTING ROLE: general co-author.",
            language_rule=lang_reply_rule,
            bilingual=bilingual_section,
            selection=selection or "SCOPE: the current slide.",
            slide=json.dumps(compact_slide),
            deck=deck_outline,
            message=message,
        )
        if not isinstance(data, dict):
            raise InvalidOutputError("The model's reply was not a JSON object.")
        msg = str(data.get("message") or "").strip()
        ops = data.get("ops") or []
        if isinstance(ops, dict):
            ops = [ops]
        return msg, ops if isinstance(ops, list) else []

