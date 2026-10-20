import pytest

from app import create_app
from app.database import init_db


@pytest.fixture
def client(tmp_path):
    app = create_app()
    app.config["TESTING"] = True
    db_file = tmp_path / "test.db"
    app.config["DATABASE_PATH"] = str(db_file)
    init_db(str(db_file))

    with app.test_client() as test_client:
        yield test_client


def test_share_token_generation_and_revocation(client):
    # 1. Create a presentation
    create_res = client.post(
        "/api/presentations",
        json={"title": "Share Verification Presentation"},
    )
    assert create_res.status_code == 201
    presentation_id = create_res.get_json()["presentation"]["id"]

    # 2. Initially, sharing is disabled
    get_res = client.get(f"/api/presentations/{presentation_id}")
    assert get_res.status_code == 200
    assert get_res.get_json()["presentation"]["is_shared"] is False

    # 3. Enable sharing via POST /share
    share_res = client.post(f"/api/presentations/{presentation_id}/share")
    assert share_res.status_code == 200
    share_data = share_res.get_json()
    assert share_data["is_shared"] is True
    share_token = share_data["share_token"]
    assert len(share_token) >= 16

    # 4. Fetch via public /api/share/<token>
    public_res = client.get(f"/api/share/{share_token}")
    assert public_res.status_code == 200
    public_data = public_res.get_json()
    assert public_data["presentation"]["title"] == "Share Verification Presentation"
    assert public_data["presentation"]["is_shared"] is True

    # 5. Revoke sharing via DELETE /share
    revoke_res = client.delete(f"/api/presentations/{presentation_id}/share")
    assert revoke_res.status_code == 200
    assert revoke_res.get_json()["is_shared"] is False

    # 6. Now /api/share/<token> must return 403 with code "revoked"
    revoked_public_res = client.get(f"/api/share/{share_token}")
    assert revoked_public_res.status_code == 403
    assert revoked_public_res.get_json()["code"] == "revoked"
