"""Generation keeps the outline the user reviewed and never substitutes template content."""

import json

import pytest

from app import create_app
from app.ai import agent_loop
from app.database import init_db


@pytest.fixture
def client(tmp_path):
    app = create_app()
    path = str(tmp_path / "gen.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    return app.test_client()


def test_generate_uses_the_reviewed_outline_and_skips_the_research_agent(client, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the research agent must not run when an outline was sent")

    monkeypatch.setattr(agent_loop.AgentLoop, "run", boom)
    outline = {"title": "EV batteries", "slides": [
        {"title": "Battery prices fell 14% to $139/kWh", "layout": "big-number", "purpose": "Headline"},
        {"title": "Recycling recovers 95% of lithium", "layout": "bullets", "purpose": "Recycling"},
    ]}
    r = client.post("/api/presentations/generate", json={"topic": "EV batteries", "slide_count": 2, "outline": outline, "stream": True},
                    headers={"Accept": "text/event-stream"})
    body = r.get_data(as_text=True)
    outline_event = next(chunk for chunk in body.split("\n\n") if chunk.startswith("event: outline"))
    sent = json.loads(outline_event.split("data: ", 1)[1])
    assert [s["title"] for s in sent["slides"]] == ["Battery prices fell 14% to $139/kWh", "Recycling recovers 95% of lithium"]


def test_real_provider_stream_writes_the_reviewed_outline_from_its_research(client, monkeypatch):
    """Non-mock path: the reviewed outline and its research dossier drive the slides; a references slide follows."""
    from app.routes import generation_routes
    from tests.test_deck_writer import DOSSIER, REVIEW, SLIDES, FakeModel

    monkeypatch.setattr(generation_routes, "get_provider", lambda: FakeModel({"Write the content": SLIDES, "Check a generated presentation": REVIEW}))
    monkeypatch.setattr("app.services.deck_generation.ImageFinder", lambda *a, **k: type("NoImages", (), {"find": lambda self, *x: None, "errors": []})())
    outline = {"title": "The human brain", "research_dossier": DOSSIER, "slides": [
        {"title": "The human brain", "visual": "image"},
        {"title": "How neurons signal", "visual": "chart", "evidence": ["S2.1"]},
        {"title": "Major structures of the brain", "visual": "diagram"},
    ]}
    r = client.post("/api/presentations/generate", json={"topic": "A board briefing on brain", "slide_count": 3, "outline": outline, "stream": True},
                    headers={"Accept": "text/event-stream"})
    events = [c for c in r.get_data(as_text=True).split(chr(10) * 2) if c.startswith("event: ")]
    done = next(e for e in events if e.startswith("event: done"))
    deck = json.loads(done.split("data: ", 1)[1])["presentation"]
    titles = [s["title"] for s in deck["slides"]]
    assert titles[:3] == ["The human brain", "How neurons signal", "Major structures of the brain"]
    assert titles[-1] == "References"
    text = json.dumps(deck["slides"])  # the removed claim survives only in the audit report
    for banned in ("Strategic Intelligence", "Stakeholder Alignment", "Capital Commitment", "McKinsey", "Gartner", "91.2%"):
        assert banned not in text


def test_slides_reuse_the_outline_research_instead_of_researching_again(client, monkeypatch):
    from app.ai import research_agent
    from app.ai.designer_agent import ExecutiveDesignerAgent

    calls = []
    monkeypatch.setattr(research_agent.ResearchAgent, "research_topic", lambda self, *a, **k: calls.append(1) or {"citations": []})
    agent = ExecutiveDesignerAgent(None)
    ctx = {"title": "EV batteries", "description": "EV batteries"}
    for i in range(4):
        agent.design_slide({"title": f"Slide {i}", "layout": "bullets"}, ctx)
    assert len(calls) == 1  # once per deck, not once per slide
