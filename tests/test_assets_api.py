import io

import pytest

from app import create_app
from app.database import init_db


@pytest.fixture
def client(tmp_path):
    app = create_app()
    db_path = str(tmp_path / "test_assets.db")
    app.config["DATABASE_PATH"] = db_path
    app.config["TESTING"] = True
    init_db(db_path)
    with app.test_client() as client:
        yield client


def test_asset_upload_and_roundtrip_headers(client):
    """Test image upload and verify roundtrip fetch with exact headers."""
    # 1. Create presentation
    pres_res = client.post("/api/presentations", json={"title": "Asset Presentation"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    # 2. Upload PNG image
    fake_png_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    data = {
        "file": (io.BytesIO(fake_png_data), "chart.png", "image/png"),
    }
    upload_res = client.post(
        f"/api/presentations/{pres_id}/assets",
        data=data,
        content_type="multipart/form-data",
    )
    assert upload_res.status_code == 201
    asset_info = upload_res.get_json()
    assert asset_info["filename"] == "chart.png"
    assert asset_info["mime"] == "image/png"
    assert asset_info["size"] == len(fake_png_data)
    asset_id = asset_info["id"]

    # 3. Fetch image and assert headers
    fetch_res = client.get(f"/api/assets/{asset_id}")
    assert fetch_res.status_code == 200
    assert fetch_res.data == fake_png_data
    assert fetch_res.headers["Content-Type"] == "image/png"
    assert "public, max-age=" in fetch_res.headers["Cache-Control"]
    assert fetch_res.headers["X-Content-Type-Options"] == "nosniff"
    assert "chart.png" in fetch_res.headers["Content-Disposition"]

    # 4. Delete asset
    del_res = client.delete(f"/api/assets/{asset_id}")
    assert del_res.status_code == 200

    # 5. Fetch after delete returns 404
    fetch_after_del = client.get(f"/api/assets/{asset_id}")
    assert fetch_after_del.status_code == 404


def test_asset_disallowed_mime(client):
    """Test uploading disallowed file types returns 415."""
    pres_res = client.post("/api/presentations", json={"title": "Mime Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    data = {
        "file": (io.BytesIO(b"malicious payload"), "payload.exe", "application/x-msdownload"),
    }
    upload_res = client.post(
        f"/api/presentations/{pres_id}/assets",
        data=data,
        content_type="multipart/form-data",
    )
    assert upload_res.status_code == 415
    assert "Disallowed file type" in upload_res.get_json()["error"]


def test_asset_oversize_rejected(client):
    """Test uploading an oversize image (>10MB) returns 413."""
    pres_res = client.post("/api/presentations", json={"title": "Size Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    # 11 MB of dummy data
    oversize_bytes = b"0" * (11 * 1024 * 1024)
    data = {
        "file": (io.BytesIO(oversize_bytes), "huge.png", "image/png"),
    }
    upload_res = client.post(
        f"/api/presentations/{pres_id}/assets",
        data=data,
        content_type="multipart/form-data",
    )
    assert upload_res.status_code == 413
    assert "File size exceeds limit" in upload_res.get_json()["error"]


def test_svg_sanitization(client):
    """Test that uploaded SVGs have script tags and event handlers stripped."""
    pres_res = client.post("/api/presentations", json={"title": "SVG Test"})
    pres_id = pres_res.get_json()["presentation"]["id"]

    malicious_svg = b"""<svg xmlns="http://www.w3.org/2000/svg" onload="alert('xss')">
        <script>alert('xss');</script>
        <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
    </svg>"""

    data = {
        "file": (io.BytesIO(malicious_svg), "vector.svg", "image/svg+xml"),
    }
    upload_res = client.post(
        f"/api/presentations/{pres_id}/assets",
        data=data,
        content_type="multipart/form-data",
    )
    assert upload_res.status_code == 201
    asset_id = upload_res.get_json()["id"]

    fetch_res = client.get(f"/api/assets/{asset_id}")
    assert fetch_res.status_code == 200
    cleaned_svg_text = fetch_res.data.decode("utf-8")
    assert "<script" not in cleaned_svg_text
    assert "onload" not in cleaned_svg_text
    assert "<circle" in cleaned_svg_text
