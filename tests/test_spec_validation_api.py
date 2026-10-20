import pytest

from app import create_app
from app.database import init_db


@pytest.fixture
def client(tmp_path):
    app = create_app()
    db_path = str(tmp_path / "test_spec_val.db")
    app.config["DATABASE_PATH"] = db_path
    app.config["TESTING"] = True
    init_db(db_path)
    with app.test_client() as client:
        yield client


def test_invalid_block_type_returns_422(client):
    """Test that an unknown block type returns 422 with a readable message."""
    pres_res = client.post("/api/presentations", json={"title": "Spec Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    slide_res = client.post(f"/api/presentations/{pres_id}/slides", json={"title": "Slide 1"})
    slide_id = slide_res.get_json()["slide"]["id"]

    bad_spec = {
        "id": "s-1",
        "order": 0,
        "blocks": [
            {
                "id": "b-unknown",
                "type": "magic_quantum_card",  # Not a recognized block type
                "x": 100,
                "y": 100,
                "w": 300,
                "h": 200,
            }
        ],
    }

    res = client.put(f"/api/presentations/{pres_id}/slides/{slide_id}", json={"spec": bad_spec})
    assert res.status_code == 422
    body = res.get_json()
    assert "Invalid slide specification" in body["error"]
    assert "details" in body


def test_bad_bounds_returns_422(client):
    """Test that negative or zero width/height returns 422."""
    pres_res = client.post("/api/presentations", json={"title": "Bounds Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    slide_res = client.post(f"/api/presentations/{pres_id}/slides", json={"title": "Slide 1"})
    slide_id = slide_res.get_json()["slide"]["id"]

    bad_bounds_spec = {
        "id": "s-1",
        "order": 0,
        "blocks": [
            {
                "id": "b-text",
                "type": "text",
                "x": 100,
                "y": 100,
                "w": -50,  # Invalid: w must be > 0
                "h": 200,
                "doc": {"type": "doc"},
                "style": {},
            }
        ],
    }

    res = client.put(f"/api/presentations/{pres_id}/slides/{slide_id}", json={"spec": bad_bounds_spec})
    assert res.status_code == 422
    body = res.get_json()
    assert "Invalid slide specification" in body["error"]


def test_invalid_dataset_schema_returns_422(client):
    """Test that an invalid dataset definition on presentation update returns 422."""
    pres_res = client.post("/api/presentations", json={"title": "Dataset Val Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    bad_datasets = {
        "bad_ds": {
            # Missing required fields like 'id', 'name', 'source'
            "columns": "invalid_not_a_list",
        }
    }

    res = client.put(f"/api/presentations/{pres_id}", json={"datasets": bad_datasets})
    assert res.status_code == 422
    body = res.get_json()
    assert "Invalid dataset schema" in body["error"]


def test_valid_spec_roundtrip_returns_200(client):
    """Test that updating a slide with a valid spec succeeds and persists."""
    pres_res = client.post("/api/presentations", json={"title": "Valid Roundtrip"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    slide_res = client.post(f"/api/presentations/{pres_id}/slides", json={"title": "Slide 1"})
    slide_id = slide_res.get_json()["slide"]["id"]

    valid_spec = {
        "id": "s-roundtrip",
        "order": 0,
        "layout": "chart-text",
        "notes": "Valid notes",
        "blocks": [
            {
                "id": "b-1",
                "type": "kpi",
                "x": 100,
                "y": 200,
                "w": 400,
                "h": 150,
                "value": "74%",
                "label": "Adoption Rate",
                "countUp": True,
            }
        ],
    }

    update_res = client.put(f"/api/presentations/{pres_id}/slides/{slide_id}", json={"spec": valid_spec})
    assert update_res.status_code == 200
    saved_slide = update_res.get_json()["slide"]
    assert saved_slide["spec"] is not None
    assert saved_slide["spec"]["layout"] == "chart-text"
    assert saved_slide["spec"]["blocks"][0]["value"] == "74%"

    # Verify via GET presentation
    get_res = client.get(f"/api/presentations/{pres_id}")
    assert get_res.status_code == 200
    fetched_slides = get_res.get_json()["presentation"]["slides"]
    assert len(fetched_slides) == 1
    assert fetched_slides[0]["spec"]["blocks"][0]["label"] == "Adoption Rate"
