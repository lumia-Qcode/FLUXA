"""Free-model routing: OpenRouter free models plus the Gemini free tier.

No real model or network: requests.post is replaced by a scripted fake.
"""

import json

import pytest

from app.ai import openrouter_provider as orp
from app.ai.provider import RateLimitedError
from app.config import Config


class _Resp:
    def __init__(self, status=200, body=None, text=None):
        self.status_code = status
        self._body = body
        self.text = text if text is not None else json.dumps(body or {})

    def json(self):
        return self._body


def _ok(content="", tool_calls=None):
    return _Resp(200, {"choices": [{"message": {"content": content, "tool_calls": tool_calls}}]})


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setattr(Config, "OPENROUTER_API_KEY", "or-test")
    monkeypatch.setattr(Config, "GEMINI_API_KEY", "gm-test")
    monkeypatch.setattr(Config, "GEMINI_MODEL", "gemini-free-a")
    monkeypatch.setattr(Config, "GEMINI_FALLBACK_MODEL", "")
    monkeypatch.setattr(Config, "OPENROUTER_MODEL", "or/main:free")
    monkeypatch.setattr(Config, "OPENROUTER_FALLBACK_MODEL", "")
    orp._EXHAUSTED_UNTIL.clear()
    yield
    orp._EXHAUSTED_UNTIL.clear()


def _script(monkeypatch, replies):
    sent = []
    replies = list(replies)

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.append({"url": url, "auth": headers.get("Authorization"), "body": json})
        return replies.pop(0)

    monkeypatch.setattr(orp.requests, "post", fake_post)
    return sent


def test_route_order_main_model_then_gemini_then_other_free_models(keys):
    routes = orp.OpenRouterProvider().routes
    assert routes[0] == {"backend": "openrouter", "model": "or/main:free"}
    assert routes[1] == {"backend": "gemini", "model": "gemini-free-a"}
    assert all(r["backend"] == "openrouter" for r in routes[2:])


def test_gemini_only_setup_is_configured(monkeypatch, keys):
    monkeypatch.setattr(Config, "OPENROUTER_API_KEY", "")
    p = orp.OpenRouterProvider()
    assert p.is_configured
    assert [r["backend"] for r in p.routes] == ["gemini"]


def test_falls_back_to_gemini_with_its_own_endpoint_and_params(monkeypatch, keys):
    sent = _script(monkeypatch, [_Resp(429, text="rate limited"), _ok('{"title": "Deck"}')])
    assert orp.OpenRouterProvider()._call("sys", "make an outline") == {"title": "Deck"}
    gemini = sent[1]
    assert gemini["url"] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert gemini["auth"] == "Bearer gm-test"
    assert gemini["body"]["model"] == "gemini-free-a"
    assert "reasoning" not in gemini["body"] and gemini["body"]["reasoning_effort"] == "medium"
    assert sent[0]["auth"] == "Bearer or-test" and "reasoning" in sent[0]["body"]


def test_openrouter_daily_limit_skips_openrouter_until_reset(monkeypatch, keys):
    daily = _Resp(429, text='{"error":{"message":"Rate limit exceeded: free-models-per-day"}}')
    sent = _script(monkeypatch, [daily, _ok('{"a": 1}'), _ok('{"b": 2}')])
    p = orp.OpenRouterProvider()
    assert p._call("", "first") == {"a": 1}
    assert p._call("", "second") == {"b": 2}
    # Second request went straight to Gemini: no wasted calls on the exhausted backend.
    assert [s["url"].split("/")[2] for s in sent] == [
        "openrouter.ai",
        "generativelanguage.googleapis.com",
        "generativelanguage.googleapis.com",
    ]
    assert orp._EXHAUSTED_UNTIL["openrouter"] > 0


def test_short_rate_limit_does_not_mark_backend_exhausted(monkeypatch, keys):
    _script(monkeypatch, [_Resp(429, text="too many requests, slow down"), _ok('{"ok": true}')])
    orp.OpenRouterProvider()._call("", "x")
    assert "openrouter" not in orp._EXHAUSTED_UNTIL


def test_all_backends_exhausted_raises_clear_error(keys):
    orp._EXHAUSTED_UNTIL["openrouter"] = orp._next_utc_midnight()
    orp._EXHAUSTED_UNTIL["gemini:gemini-free-a"] = orp._next_utc_midnight()
    with pytest.raises(RateLimitedError, match="daily quota"):
        orp.OpenRouterProvider()._call("", "x")


def test_invalid_json_retries_once(monkeypatch, keys):
    _script(monkeypatch, [_ok("We need to think about the schema..."), _ok('{"fixed": true}')])
    assert orp.OpenRouterProvider()._call("", "x") == {"fixed": True}


def test_json_mode_rejection_retries_without_response_format(monkeypatch, keys):
    sent = _script(monkeypatch, [_Resp(400, text="response_format unsupported"), _ok('{"x": 1}')])
    assert orp.OpenRouterProvider()._call("", "x") == {"x": 1}
    assert "response_format" in sent[0]["body"] and "response_format" not in sent[1]["body"]


def test_chat_message_returns_tool_calls_through_gemini(monkeypatch, keys):
    call = {"id": "c1", "type": "function", "function": {"name": "web_search", "arguments": "{}"}}
    sent = _script(monkeypatch, [_Resp(503, text="down"), _ok("", [call])])
    msg = orp.OpenRouterProvider().chat_message([{"role": "user", "content": "hi"}], tools=[{"type": "function"}])
    assert msg["tool_calls"] == [call]
    assert msg["route"] == "gemini gemini-free-a"
    assert sent[1]["body"]["tools"] == [{"type": "function"}]


def test_next_utc_midnight():
    # 2026-11-22 13:00 UTC -> 2026-11-23 00:00 UTC
    assert orp._next_utc_midnight(1795352400) == 1795392000


def test_gemini_project_without_free_tier_is_skipped(monkeypatch, keys):
    monkeypatch.setattr(Config, "GEMINI_FALLBACK_MODEL", "gemini-free-b")
    no_free = _Resp(403, text='{"error":{"message":"The Gemini API free tier is not available for this project."}}')
    sent = _script(monkeypatch, [_Resp(503, text="down"), no_free, _ok('{"a": 1}'), _ok('{"b": 2}')])
    p = orp.OpenRouterProvider()
    assert p._call("", "first") == {"a": 1}
    assert p._call("", "second") == {"b": 2}
    hosts = [s["url"].split("/")[2] for s in sent]
    # Gemini is asked once; its second model and later requests skip it.
    assert hosts.count("generativelanguage.googleapis.com") == 1
