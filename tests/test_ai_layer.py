"""Tests for Phase 5 AI layer: provider, compiler, status, streaming, and chat ops."""

from app.ai import compile_semantic_slide, repair_content_limits
from app.ai.mock_provider import MockProvider
from tests.ft12_helpers import make_client


def test_ai_status(tmp_path):
    client = make_client(tmp_path)
    res = client.get("/api/ai/status")
    assert res.status_code == 200
    data = res.get_json()
    assert "configured" in data
    assert "provider" in data
    assert "message" in data


def test_mock_provider_outline_and_slide():
    provider = MockProvider()
    outline = provider.generate_outline("Quarterly Strategy", 4)
    assert outline["title"] == "Quarterly Strategy"
    assert len(outline["slides"]) == 4

    # Test each layout compilation
    for i, item in enumerate(outline["slides"]):
        semantic = provider.generate_slide(item, {"title": outline["title"]})
        slide_spec, ds = compile_semantic_slide(semantic, i + 1)
        assert slide_spec["layout"] == item["layout"]
        assert len(slide_spec["blocks"]) > 0
        assert slide_spec["id"].startswith("slide-")


def test_compiler_content_limits():
    overlong_semantic = {
        "title": "A" * 120,
        "subtitle": "B" * 200,
        "bullets": ["Point " + "C" * 150 for _ in range(10)],
        "chart": {
            "kind": "bar",
            "data": [{"x": str(i), "y": i} for i in range(25)],
        },
    }
    repaired = repair_content_limits(overlong_semantic)
    assert len(repaired["title"]) <= 70
    assert len(repaired["subtitle"]) <= 100
    assert len(repaired["bullets"]) <= 5
    for b in repaired["bullets"]:
        assert len(b) <= 220  # room for a complete sourced claim and its [n] marks; cut at a word
    assert len(repaired["chart"]["data"]) <= 12


def test_ai_chat_ops_and_persistence(tmp_path):
    client = make_client(tmp_path)

    # Create test presentation
    pres_res = client.post("/api/presentations", json={"title": "AI Deck"})
    assert pres_res.status_code == 201
    pres_id = pres_res.get_json()["presentation"]["id"]

    # Post AI chat command
    chat_res = client.post(
        f"/api/presentations/{pres_id}/ai/chat",
        json={
            "message": "Make this slide shorter",
            "current_slide": {
                "id": "slide-123",
                "title": "Strategy",
                "blocks": [
                    {
                        "id": "b1",
                        "type": "text",
                        "props": {"bullets": ["Long bullet 1", "Long bullet 2", "Long bullet 3"]},
                    }
                ],
            },
        },
    )
    assert chat_res.status_code == 200
    data = chat_res.get_json()
    assert "message" in data
    assert "ops" in data
    assert len(data["ops"]) > 0
    assert data["ops"][0]["op"] == "set_block_props"

    # Fetch chat messages history
    msg_res = client.get(f"/api/presentations/{pres_id}/ai/messages")
    assert msg_res.status_code == 200
    history = msg_res.get_json()["messages"]
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"
    assert history[1]["ops"] is not None


def test_generate_stream_sse(tmp_path):
    client = make_client(tmp_path)
    res = client.post(
        "/api/presentations/generate",
        json={"topic": "Quantum Computing", "slide_count": 3, "stream": True},
    )
    assert res.status_code == 200
    assert "text/event-stream" in res.content_type

    raw_text = res.get_data(as_text=True)
    assert "event: outline" in raw_text
    assert "event: slide" in raw_text
    assert "event: progress" in raw_text
    assert "event: done" in raw_text
