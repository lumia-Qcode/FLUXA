import pytest

from app import create_app
from app.database import init_db


@pytest.fixture
def client(tmp_path):
    app = create_app()
    db_path = str(tmp_path / "test_rev.db")
    app.config["DATABASE_PATH"] = db_path
    app.config["TESTING"] = True
    init_db(db_path)
    with app.test_client() as client:
        yield client


def test_revision_conflict_returns_409(client):
    """Test that two writes with the same revision return 409 on the second write."""
    # 1. Create a presentation
    create_res = client.post("/api/presentations", json={"title": "Revision Test Deck"})
    assert create_res.status_code == 201
    pres_id = create_res.get_json()["presentation"]["id"]
    rev = create_res.get_json()["presentation"]["revision"]
    assert rev == 1

    # 2. First update with current revision=1 -> should succeed and bump to 2
    update_res_1 = client.put(
        f"/api/presentations/{pres_id}",
        json={"title": "Updated Title v1", "revision": 1},
    )
    assert update_res_1.status_code == 200
    assert update_res_1.get_json()["presentation"]["revision"] == 2

    # 3. Second write with stale revision=1 -> must return 409 Conflict
    stale_update = client.put(
        f"/api/presentations/{pres_id}",
        json={"title": "Stale Concurrent Update", "revision": 1},
    )
    assert stale_update.status_code == 409
    body = stale_update.get_json()
    assert "Conflict" in body["error"]
    assert body["current_revision"] == 2

    # 4. Third write with correct revision=2 -> should succeed and bump to 3
    correct_update = client.put(
        f"/api/presentations/{pres_id}",
        json={"title": "Updated Title v2", "revision": 2},
    )
    assert correct_update.status_code == 200
    assert correct_update.get_json()["presentation"]["revision"] == 3
