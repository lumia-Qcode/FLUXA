"""Part B deck features: rehearse, stress test, time plan, demo, decision room, memory map, ask anything."""

import pytest

from app import auth, create_app
from app.ai import deck_features as df
from app.database import init_db
from app.prompts.features import role_rule


class FakeProvider:
    is_configured = True

    def __init__(self, replies):
        self.replies = replies
        self.calls = []

    def _call(self, system, prompt, max_tokens=1500, history=None):
        self.calls.append({"system": system, "user": prompt})
        key = next(k for k in self.replies if k in system or k in prompt)
        reply = self.replies[key]
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def app_db(tmp_path, anon_client_class):
    app = create_app()
    path = str(tmp_path / "features.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    auth._FAILED.clear()
    df._ASK_LAST.clear()
    df._ASK_DECK.clear()
    return app


def signed_in(app):
    c = app.test_client()
    assert c.post("/api/auth/signup", json={"email": "a@example.com", "password": "long-enough-pw"}).status_code == 201
    return c


def deck_with_slides(c, titles=("Opening", "Evidence: 58% adoption", "Close")):
    pid = c.post("/api/presentations", json={"title": "Hospitals and AI"}).get_json()["presentation"]["id"]
    for t in titles:
        spec = {"id": f"s-{t[:4]}", "layout": "bullets", "notes": "", "blocks": [
            {"id": f"t-{t[:4]}", "type": "text", "role": "title", "x": 0, "y": 0, "w": 100, "h": 50, "content": t}]}
        c.post(f"/api/presentations/{pid}/slides", json={"title": t, "spec": spec})
    return pid


def use(monkeypatch, replies):
    fake = FakeProvider(replies)
    monkeypatch.setattr(df, "get_provider", lambda: fake)
    return fake


def test_digest_lists_every_slide(app_db):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    from app.database import get_connection

    conn = get_connection(app_db.config["DATABASE_PATH"])
    slides = df.deck_slides(conn, pid)
    conn.close()
    text = df.digest(slides)
    assert "Slide 2: Evidence: 58% adoption" in text and "Slide 3: Close" in text


def test_rehearse_returns_persona_questions_linked_to_slides(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    fake = use(monkeypatch, {"Personas": {"personas": [{"persona": "Skeptical CFO", "questions": [
        {"question": "58% of what?", "slide": 2, "why": "No denominator"}], "confusing_slides": [], "weak_arguments": []}]}})
    r = c.post(f"/api/presentations/{pid}/ai/rehearse", json={"personas": ["Skeptical CFO"]})
    body = r.get_json()
    assert r.status_code == 200 and body["personas"][0]["questions"][0]["slideId"].startswith("slide-")
    assert "<untrusted_data" in fake.calls[0]["user"]  # deck text is passed as data


def test_stress_test_sorts_by_severity(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"debate panel": {"verdict": "Shaky.", "challenges": [
        {"slide": 1, "claim": "a", "challenge": "x", "counter": "y", "evidence_needed": "z", "severity": "low"},
        {"slide": 2, "claim": "b", "challenge": "x", "counter": "y", "evidence_needed": "z", "severity": "high"}]}})
    body = c.post(f"/api/presentations/{pid}/ai/stress-test").get_json()
    assert [x["severity"] for x in body["challenges"]] == ["high", "low"] and body["verdict"] == "Shaky."


def test_ai_unavailable_is_honest_not_a_template(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"debate panel": RuntimeError("HTTP 429 rate limit")})
    r = c.post(f"/api/presentations/{pid}/ai/stress-test")
    assert r.status_code == 503 and r.get_json()["code"] == "ai_unavailable" and "quota" in r.get_json()["error"]


def test_time_plan_always_keeps_opening_and_close(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"Time limit": {"summary": "Short.", "slides": [
        {"slide": 1, "keep": False, "minutes": 0}, {"slide": 2, "keep": True, "minutes": 2}, {"slide": 3, "keep": False}]}})
    body = c.post(f"/api/presentations/{pid}/ai/time-plan", json={"minutes": 3}).get_json()
    assert [s["keep"] for s in body["slides"]] == [True, True, True]
    assert c.post(f"/api/presentations/{pid}/ai/time-plan", json={"minutes": 0}).status_code == 400


def test_demo_code_is_sanitised(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"Build this demo": {"title": "ROI", "html": '<div id="x"></div><script src="https://evil/x.js"></script>',
                                          "css": "", "js": "fetch('https://evil'); localStorage.x = 1; document.getElementById('x').textContent = 5;"}})
    body = c.post(f"/api/presentations/{pid}/ai/demo", json={"request": "an ROI calculator"}).get_json()
    assert "fetch(" not in body["code"]["js"] and "localStorage" not in body["code"]["js"]
    assert "evil/x.js" not in body["code"]["html"] and "textContent = 5" in body["code"]["js"]


def test_decision_room_builds_a_comparison_slide(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"Decision:": {"title": "Which rollout?", "options": [
        {"option": "Radiology first", "consequences": ["Fast wins"], "main_risk": "Narrow", "confidence": "high"},
        {"option": "All at once", "consequences": ["Costly"], "main_risk": "Overload", "confidence": "low"}]}})
    body = c.post(f"/api/presentations/{pid}/ai/decision", json={"question": "Which rollout?", "options": ["Radiology first", "All at once"]}).get_json()
    comp = next(b for b in body["slide"]["blocks"] if b["type"] == "comparison")
    assert [col["title"] for col in comp["columns"]] == ["Radiology first", "All at once"]
    assert "Risk: Narrow" in comp["columns"][0]["items"]
    assert c.post(f"/api/presentations/{pid}/ai/decision", json={"question": "x?", "options": ["only one"]}).status_code == 400


def test_memory_map_is_cached_per_deck_version(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    fake = use(monkeypatch, {"memory map": {"title": "AI in hospitals", "concepts": [
        {"id": "c1", "label": "Adoption", "slide": 2, "importance": 3}, {"id": "c2", "label": "Payback", "importance": 1}],
        "links": [{"from": "c1", "to": "c2", "label": "drives"}, {"from": "c1", "to": "nope"}], "numbers": [{"value": "58%", "label": "adoption"}],
        "takeaways": ["Start small"]}})
    first = c.get(f"/api/presentations/{pid}/ai/memory-map").get_json()
    second = c.get(f"/api/presentations/{pid}/ai/memory-map").get_json()
    assert first["concepts"][0]["slideId"].startswith("slide-") and len(first["links"]) == 1
    assert second["ai"].get("cached") is True and len(fake.calls) == 1


def test_ask_anything_is_public_only_for_shared_decks_and_rate_limited(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    use(monkeypatch, {"Question:": {"answer": "It is 58% of health systems (slide 2).", "slides": [2, 99], "covered": True}})
    anon = app_db.test_client()
    assert anon.post(f"/api/presentations/share/{pid}/ask", json={"question": "What is 58%?"}).status_code == 404  # not shared
    token = c.post(f"/api/presentations/{pid}/share").get_json()["share_token"]
    r = anon.post(f"/api/presentations/share/{token}/ask", json={"question": "What is 58%?", "participant_id": "p1"})
    assert r.status_code == 200 and r.get_json()["slides"] == [2]  # out-of-range slide numbers dropped
    again = anon.post(f"/api/presentations/share/{token}/ask", json={"question": "And then?", "participant_id": "p1"})
    assert again.status_code == 429


def test_coauthor_roles_steer_copilot():
    assert "Designer" in role_rule("designer") and "speaker notes" in role_rule("coach")
    assert role_rule("hacker") == ""


# --- batch 2 -------------------------------------------------------------------------------

def test_related_slides_come_only_from_the_same_org(app_db):
    a = signed_in(app_db)
    old = deck_with_slides(a, titles=("Radiology AI adoption", "Ambient scribes cut documentation"))
    current = a.post("/api/presentations", json={"title": "Radiology AI rollout plan"}).get_json()["presentation"]["id"]
    body = a.get(f"/api/presentations/{current}/related-slides").get_json()
    assert body["slides"] and body["slides"][0]["slideTitle"] == "Radiology AI adoption"
    assert all(s["deckId"] == old for s in body["slides"])
    assert a.get(f"/api/presentations/{current}/related-slides?q=scribes").get_json()["slides"][0]["slideTitle"].startswith("Ambient")

    other = app_db.test_client()
    other.post("/api/auth/signup", json={"email": "b@example.com", "password": "long-enough-pw"})
    theirs = other.post("/api/presentations", json={"title": "Radiology AI"}).get_json()["presentation"]["id"]
    assert other.get(f"/api/presentations/{theirs}/related-slides").get_json()["slides"] == []
    assert other.get(f"/api/presentations/{current}/related-slides").status_code == 404


def test_live_data_maps_csv_and_json_columns(app_db, monkeypatch):
    from app.ai import research_tools as rt

    c = signed_in(app_db)
    pid = deck_with_slides(c)
    cols = [{"key": "category", "label": "Category", "type": "text"}, {"key": "value", "label": "Value", "type": "number"}]
    responses = {
        "https://data.example/a.csv": ("text/csv", b"Category,Value (%)\nRadiology,81\nScribes,\"1,200\"\n"),
        "https://data.example/b.json": ("application/json", b'{"rows": [{"category": "ICU", "value": "55%"}]}'),
        "https://data.example/c.csv": ("text/csv", b"foo,bar\n1,2\n"),
    }

    def fake_get(url, **kw):
        if url not in responses:
            raise rt.UnsafeURLError("blocked")
        ctype, body = responses[url]
        return url, ctype, body, False

    monkeypatch.setattr(rt, "safe_get", fake_get)
    r = c.post(f"/api/presentations/{pid}/datasets/live-refresh", json={"url": "https://data.example/a.csv", "columns": cols}).get_json()
    assert r["rows"] == [{"category": "Radiology", "value": 81}, {"category": "Scribes", "value": 1200}]
    r = c.post(f"/api/presentations/{pid}/datasets/live-refresh", json={"url": "https://data.example/b.json", "columns": cols}).get_json()
    assert r["rows"] == [{"category": "ICU", "value": 55}]
    r = c.post(f"/api/presentations/{pid}/datasets/live-refresh", json={"url": "https://data.example/c.csv", "columns": cols})
    assert r.status_code == 422 and r.get_json()["code"] == "no_match"
    r = c.post(f"/api/presentations/{pid}/datasets/live-refresh", json={"url": "http://169.254.169.254/x", "columns": cols})
    assert r.status_code == 400 and r.get_json()["code"] == "unsafe_url"


# --- heavy three: captions (#10) and narration (#6) ----------------------------------------------

def _live_session(c, pid):
    r = c.post("/api/live/sessions", json={"presentation_id": pid})
    body = r.get_json()
    return body.get("session_id") or body["id"], body.get("host_token")


def test_captions_presenter_only_and_translated_once(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    sid, token = _live_session(c, pid)
    df._CAPTIONS.clear()
    df._TRANSLATIONS.clear()
    df._LAST_TRANSLATE.clear()
    assert c.post(f"/api/presentations/live/{sid}/captions", json={"text": "Hello", "host_token": "wrong"}).status_code == 403
    for line in ("Radiology leads adoption.", "Scribes save time."):
        assert c.post(f"/api/presentations/live/{sid}/captions", json={"text": line, "host_token": token}).status_code == 201
    fake = use(monkeypatch, {"Target language": {"translations": ["ریڈیالوجی آگے ہے۔", "اسکرائبز وقت بچاتے ہیں۔"]}})
    audience = app_db.test_client()
    en = audience.get(f"/api/presentations/live/{sid}/captions?lang=en").get_json()
    assert [l["text"] for l in en["captions"]] == ["Radiology leads adoption.", "Scribes save time."]
    ur = audience.get(f"/api/presentations/live/{sid}/captions?lang=ur").get_json()
    assert ur["machineTranslated"] and ur["captions"][0]["text"] == "ریڈیالوجی آگے ہے۔"
    audience.get(f"/api/presentations/live/{sid}/captions?lang=ur")  # cached: no second call
    assert len(fake.calls) == 1
    assert audience.get(f"/api/presentations/live/{sid}/captions?lang=xx").status_code == 400
    after = audience.get(f"/api/presentations/live/{sid}/captions?lang=en&after=1").get_json()
    assert [l["seq"] for l in after["captions"]] == [2]


def test_narration_covers_every_slide_and_is_cached(app_db, monkeypatch):
    c = signed_in(app_db)
    pid = deck_with_slides(c)
    fake = use(monkeypatch, {"voice-over": {"slides": [{"slide": 1, "script": "Welcome."}, {"slide": 2, "script": "58% adopted."}]}})
    body = c.get(f"/api/presentations/{pid}/ai/narration").get_json()
    assert [s["script"] for s in body["slides"]] == ["Welcome.", "58% adopted.", "Close"]  # missing slide falls back to its title
    c.get(f"/api/presentations/{pid}/ai/narration")
    assert len(fake.calls) == 1
