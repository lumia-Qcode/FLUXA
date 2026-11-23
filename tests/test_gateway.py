"""AI gateway: per-feature effort, usage log, honest fallback status, per-org cache."""

import json
import sqlite3

import pytest

from app import create_app
from app.ai import gateway
from app.ai import openrouter_provider as orp
from app.config import Config
from app.database import init_db


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "gw.db")
    init_db(path)
    return path


def rows(db, sql, *args):
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


def test_effort_follows_the_feature():
    assert gateway.effort() == "medium"  # outside any session
    with gateway.session("copilot.chat"):
        assert gateway.effort() == "low"
        with gateway.session("research.live"):
            assert gateway.effort() == "medium"
        assert gateway.effort() == "low"
    with gateway.session("outline.generate"):
        assert gateway.effort() == "high"


def test_fallbacks_are_reported_and_shared_with_nested_sessions():
    with gateway.session("outline.generate"):
        assert gateway.status() == {"mode": "live"}
        with gateway.session("research.live"):
            gateway.mark_fallback("Research used built-in example facts.")
        assert gateway.status() == {"mode": "fallback", "reasons": ["Research used built-in example facts."]}
    assert gateway.status() == {"mode": "live"}  # nothing leaks out of the session


def test_usage_is_recorded_per_org_user_and_feature(db):
    with gateway.session("copilot.chat", org_id=7, user_id=3, db_path=db):
        gateway.record("openrouter m", "ok", {"prompt_tokens": 120, "completion_tokens": 30}, 812.4)
        gateway.record("openrouter m", "http_429", total_ms=50)
    got = rows(db, "SELECT org_id, user_id, feature, effort, input_tokens, output_tokens, total_ms, status FROM ai_usage ORDER BY id")
    assert got == [
        {"org_id": 7, "user_id": 3, "feature": "copilot.chat", "effort": "low", "input_tokens": 120, "output_tokens": 30, "total_ms": 812, "status": "ok"},
        {"org_id": 7, "user_id": 3, "feature": "copilot.chat", "effort": "low", "input_tokens": None, "output_tokens": None, "total_ms": 50, "status": "http_429"},
    ]
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    summary = gateway.usage_summary(conn, 7)
    conn.close()
    assert summary[0]["feature"] == "copilot.chat" and summary[0]["calls"] == 2 and summary[0]["ok_calls"] == 1


def test_cache_reuses_results_within_an_org_only(db):
    calls = []

    def compute():
        calls.append(1)
        return {"title": f"Outline {len(calls)}"}

    inputs = {"topic": "Coffee", "slide_count": 6}
    with gateway.session("outline.generate", org_id=1, db_path=db):
        assert gateway.cached("outline.generate", inputs, compute) == {"title": "Outline 1"}
    with gateway.session("outline.generate", org_id=1, db_path=db) as ctx:
        assert gateway.cached("outline.generate", inputs, compute) == {"title": "Outline 1"}
        assert ctx.get("cache_hit") is True
    with gateway.session("outline.generate", org_id=2, db_path=db):
        assert gateway.cached("outline.generate", inputs, compute) == {"title": "Outline 2"}
    assert len(calls) == 2


def test_template_results_are_never_cached(db):
    def template():
        gateway.mark_fallback("Outline template used")
        return {"title": "Template"}

    with gateway.session("outline.generate", org_id=1, db_path=db):
        gateway.cached("outline.generate", {"topic": "x"}, template)
    assert rows(db, "SELECT * FROM ai_cache") == []


def test_provider_sends_feature_effort_and_logs_each_attempt(monkeypatch, db):
    monkeypatch.setattr(Config, "OPENROUTER_API_KEY", "or-test")
    monkeypatch.setattr(Config, "GEMINI_API_KEY", "")
    orp._EXHAUSTED_UNTIL.clear()
    sent = []

    class Resp:
        def __init__(self, status, body):
            self.status_code, self._body, self.text = status, body, json.dumps(body)

        def json(self):
            return self._body

    replies = [
        Resp(503, {"error": "down"}),
        Resp(200, {"choices": [{"message": {"content": '{"ok": true}'}}], "usage": {"prompt_tokens": 9, "completion_tokens": 4}}),
    ]

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.append(json)
        return replies.pop(0)

    monkeypatch.setattr(orp.requests, "post", fake_post)
    with gateway.session("copilot.chat", org_id=5, user_id=2, db_path=db):
        assert orp.OpenRouterProvider()._call("", "edit") == {"ok": True}
    assert all(p["reasoning"]["effort"] == "low" for p in sent)
    assert [r["status"] for r in rows(db, "SELECT status FROM ai_usage ORDER BY id")] == ["http_503", "ok"]


# --- routes ---------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path):
    app = create_app()
    path = str(tmp_path / "routes.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    return app.test_client()


def test_outline_route_reports_template_fallback(client, monkeypatch):
    # The mock provider path: generation goes through the prompt service, which here fails,
    # so the route falls back. A designer template marks the fallback; simulate it directly.
    from app.routes import generation_routes

    class FakeProvider:
        name = "openrouter"
        is_configured = True

    def outline_from_plan(provider, values, progress=None):
        gateway.mark_fallback("The AI model was unavailable, so the outline was built from the research plan.")
        return {"title": "T", "slides": [{"title": "S1"}]}

    monkeypatch.setattr(generation_routes, "get_provider", lambda: FakeProvider())
    monkeypatch.setattr(generation_routes, "research_and_outline", outline_from_plan)
    r = client.post("/api/presentations/generate/outline", json={"topic": "Coffee", "slide_count": 3})
    assert r.status_code == 200
    body = r.get_json()
    assert body["ai"]["mode"] == "fallback"
    assert "research plan" in body["ai"]["reasons"][0]


def test_outline_route_caches_live_outlines(client, monkeypatch):
    from app.routes import generation_routes

    calls = []

    class FakeProvider:
        name = "openrouter"
        is_configured = True

    def live_outline(provider, values, progress=None):
        calls.append(1)
        return {"title": "Live", "slides": [{"title": "S1"}]}

    monkeypatch.setattr(generation_routes, "get_provider", lambda: FakeProvider())
    monkeypatch.setattr(generation_routes, "research_and_outline", live_outline)
    req = {"topic": "Coffee", "slide_count": 3}
    first = client.post("/api/presentations/generate/outline", json=req).get_json()
    second = client.post("/api/presentations/generate/outline", json=req).get_json()
    assert first["ai"] == {"mode": "live"}
    assert second["ai"] == {"mode": "live", "cached": True}
    assert second["outline"]["title"] == "Live" and len(calls) == 1


def test_ai_usage_endpoint_is_admin_only(client):
    assert client.get("/api/org/ai-usage").status_code == 200  # the test user is an admin
    body = client.get("/api/org/ai-usage?days=3").get_json()
    assert body["days"] == 3 and body["features"] == []
