"""Topic-matched 3D models (app/ai/model_library.py) and their use in the compiler."""

from app.ai import compiler
from app.ai import model_library as ml

HEART = {
    "uid": "3f8072336ce94d18b3d0d055a1ece089",
    "name": "Realistic Human Heart",
    "user": {"displayName": "neshallads", "profileUrl": "https://sketchfab.com/neshallads"},
    "license": {"label": "CC Attribution"},
    "thumbnails": {"images": [{"url": "https://media.sketchfab.com/t.jpg", "width": 640}]},
    "viewerUrl": "https://sketchfab.com/3d-models/x",
    "likeCount": 50,
    "faceCount": 22000,
    "tags": [{"name": "heart"}],
}
BODY = {**HEART, "uid": "9b0b079953b840bc9a13f524b60041e4", "name": "Full Body Anatomy", "likeCount": 5000, "tags": []}


class FakeResp:
    def __init__(self, results):
        self._results = results

    def raise_for_status(self):
        pass

    def json(self):
        return {"results": self._results}


def fake_search(monkeypatch, results, calls=None):
    def get(url, params=None, headers=None, timeout=None):
        if calls is not None:
            calls.append(params["q"])
        return FakeResp(results)

    ml._CACHE.clear()
    monkeypatch.setattr(ml.requests, "get", get)


def test_keywords_drop_presentation_filler():
    assert ml.keywords("A board briefing on how hospitals are adopting AI.") == "hospitals ai"
    assert ml.keywords("The human heart: how it works") == "human heart"


def test_name_matches_rank_above_popularity_and_results_are_cached(monkeypatch):
    calls = []
    fake_search(monkeypatch, [BODY, HEART], calls)
    first = ml.search_models("human heart")
    assert first[0]["name"] == "Realistic Human Heart" and first[0]["license"] == "CC Attribution"
    ml.search_models("Human Heart")
    assert calls == ["human heart"]


def test_bad_or_restricted_results_are_skipped(monkeypatch):
    fake_search(monkeypatch, [{**HEART, "uid": "../evil"}, {**HEART, "isAgeRestricted": True}, {**HEART, "faceCount": 9_000_000}])
    assert ml.search_models("heart") == []


def test_failures_return_nothing(monkeypatch):
    def boom(*a, **k):
        raise OSError("offline")

    ml._CACHE.clear()
    monkeypatch.setattr(ml.requests, "get", boom)
    assert ml.search_models("heart") == [] and ml.model_for_slide("Heart", "Valves") is None


def test_compiler_uses_a_topic_model_and_falls_back_to_scenes(monkeypatch):
    fake_search(monkeypatch, [HEART])
    spec, _ = compiler.compile_semantic_slide({"layout": "title", "title": "The Human Heart", "deck_topic": "The human heart"}, 1, set(), 6, [0])
    media = next(b for b in spec["blocks"] if b.get("role") == "media")
    assert media["sketchfab"]["uid"] == HEART["uid"] and media["model3d"] is None

    fake_search(monkeypatch, [])
    spec, _ = compiler.compile_semantic_slide({"layout": "title", "title": "Hospital AI", "deck_topic": "hospital healthcare AI"}, 1, set(), 6, [0])
    media = next(b for b in spec["blocks"] if b.get("role") == "media")
    assert media["sketchfab"] is None and media["model3d"]  # built-in scene as before
