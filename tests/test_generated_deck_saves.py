"""Edits to AI-generated decks must save (they were silently rejected before)."""

import pytest

from app import create_app
from app.database import init_db
from app.routes.presentation_routes import normalize_datasets
from app.routes.slide_routes import check_slide_spec

@pytest.fixture
def client(tmp_path):
    app = create_app()
    path = str(tmp_path / "gen.db")
    app.config.update(TESTING=True, DATABASE_PATH=path)
    init_db(path)
    return app.test_client()


GENERATED_SLIDE = {
    "id": "slide-0876e89706be",
    "layout": "swot",
    "background": {"type": "solid"},
    "notes": "",
    "blocks": [
        {"id": "t", "type": "text", "role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "content": "Title"},
        {"id": "k", "type": "kpi", "x": 100, "y": 300, "w": 400, "h": 200, "value": "58%", "label": "Adoption", "delta": "+12%"},
        {"id": "c", "type": "citation", "x": 100, "y": 975, "w": 1720, "h": 65, "citations": ["NEJM AI (2025)"]},
    ],
}


def test_generated_slide_specs_are_accepted():
    assert check_slide_spec(GENERATED_SLIDE) is None


def test_broken_slide_specs_are_still_refused():
    assert check_slide_spec({"blocks": "nope"})
    assert check_slide_spec({"blocks": [{"type": "text"}]})  # no id
    assert check_slide_spec({"blocks": [{"id": "x", "type": "magic"}]})
    assert check_slide_spec({"blocks": [{"id": "x", "type": "text", "w": -5}]})


def test_old_generated_datasets_are_repaired():
    fixed = normalize_datasets(
        {"ds": {"id": "ds", "name": "Adoption", "source": "ai-estimate", "rows": [],
                "columns": [{"key": "category", "name": "Category", "type": "string"}, {"key": "value", "name": "Value", "type": "number"}]}}
    )
    cols = fixed["ds"]["columns"]
    assert cols[0] == {"key": "category", "label": "Category", "type": "text"}
    assert cols[1]["label"] == "Value" and cols[1]["type"] == "number"


def test_a_generated_deck_saves_end_to_end(client):
    pid = client.post("/api/presentations", json={"title": "Gen"}).get_json()["presentation"]["id"]
    datasets = {
        "dataset_1": {"id": "dataset_1", "name": "Adoption", "source": "ai-estimate", "rows": [{"category": "A", "value": 1}],
                      "columns": [{"key": "category", "name": "Category", "type": "string"}, {"key": "value", "name": "Value", "type": "number"}]},
    }
    research = {"research": {"citations": [{"source": "NEJM"}], "chart_datasets": {}}}  # notes the generator keeps here
    r = client.put(f"/api/presentations/{pid}", json={"datasets": {**datasets, **research}, "variables": research})
    assert r.status_code == 200, r.get_json()
    sid = client.post(f"/api/presentations/{pid}/slides", json={"title": "S"}).get_json()["slide"]["id"]
    r = client.put(f"/api/presentations/{pid}/slides/{sid}", json={"spec": GENERATED_SLIDE})
    assert r.status_code == 200, r.get_json()
