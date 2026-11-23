"""Brand store (F6): token schema, versions, roles, tenant isolation, deck brand."""

import json
import sqlite3

import pytest

from app import auth, create_app
from app.brand import tokens as bt
from app.database import init_db

ACME = {
    "schemaVersion": 1,
    "colors": {
        "primary": [{"hex": "#0A3D91", "name": "Acme Blue", "confidence": 0.97}],
        "secondary": [{"hex": "#F2A900"}],
        "neutrals": ["#FFFFFF", "#1D1D1F", "#6B7280"],
        "chart": ["#0A3D91", "#F2A900", "#1D1D1F", "#6B7280", "#2E7D32", "#C62828"],
    },
    "typography": {
        "heading": {"family": "Acme Sans", "weights": [700], "fallback": ["Inter", "Arial", "sans-serif"]},
        "body": {"family": "Acme Text", "weights": [400]},
        "scale": {"title": 72},
    },
    "footer": {"enabled": True, "right": "{{slideNumber}}"},
}


# --- tokens ---------------------------------------------------------------------------

def test_tokens_validate_and_map_onto_the_theme_shape():
    tokens = bt.validate_tokens(ACME)
    assert bt.to_theme_overrides(tokens) == {
        "colors": {
            "primary": "#0A3D91",
            "secondary": "#F2A900",
            "bg": "#FFFFFF",
            "text": "#1D1D1F",
            "muted": "#6B7280",
            "chart": ACME["colors"]["chart"],
        },
        "fonts": {"heading": "Acme Sans", "body": "Acme Text"},
        "titleStyle": {"size": 72},
    }


def test_a_minimal_brand_only_overrides_what_it_sets():
    tokens = bt.validate_tokens({"colors": {"primary": [{"hex": "#112233"}]}})
    assert bt.to_theme_overrides(tokens) == {"colors": {"primary": "#112233"}}


@pytest.mark.parametrize(
    "bad, path",
    [
        ({"colors": {"primary": []}}, "colors.primary"),
        ({"colors": {"primary": [{"hex": "blue"}]}}, "colors.primary.0.hex"),
        ({"colors": {"primary": [{"hex": "#123456"}], "chart": ["#111111"]}}, "colors.chart"),
        ({"colors": {"primary": [{"hex": "#123456"}]}, "typography": {"heading": {"family": 'X"; } body {'}}}, "typography.heading.family"),
        ({"colors": {"primary": [{"hex": "#123456"}]}, "typography": {"body": {"family": "A", "weights": [450]}}}, "typography.body.weights"),
        ({"colors": {"primary": [{"hex": "#123456"}]}, "surprise": 1}, "surprise"),
        ({"schemaVersion": 2, "colors": {"primary": [{"hex": "#123456"}]}}, "schemaVersion"),
    ],
)
def test_invalid_tokens_are_rejected_with_a_path(bad, path):
    with pytest.raises(bt.TokenError) as exc:
        bt.validate_tokens(bad)
    assert any(p["path"] == path for p in exc.value.problems), exc.value.problems


def test_oversized_tokens_are_rejected():
    big = {"colors": {"primary": [{"hex": "#123456"}]}, "imagery": {"notes": "x" * (bt.MAX_TOKENS_BYTES + 1)}}
    with pytest.raises(bt.TokenError):
        bt.validate_tokens(big)


def test_shared_json_schema_file_matches_the_model():
    on_disk = json.loads(bt.SCHEMA_PATH.read_text(encoding="utf-8"))
    assert on_disk == bt.json_schema(), "run: python -m app.brand.tokens"


# --- API ------------------------------------------------------------------------------

@pytest.fixture
def app_db(tmp_path, anon_client_class):
    app = create_app()
    db_path = str(tmp_path / "brand.db")
    app.config.update(TESTING=True, DATABASE_PATH=db_path)
    init_db(db_path)
    auth._FAILED.clear()
    return app, db_path


def signed_in(app, email):
    c = app.test_client()
    r = c.post("/api/auth/signup", json={"email": email, "password": "long-enough-pw"})
    assert r.status_code == 201, r.get_json()
    return c


def join_as(app, admin, email, role):
    token = admin.post("/api/org/invites", json={"role": role, "email": email}).get_json()["token"]
    c = app.test_client()
    r = c.post("/api/auth/signup", json={"email": email, "password": "long-enough-pw", "invite": token})
    assert r.status_code == 201, r.get_json()
    return c


def make_active_brand(c, name="Acme"):
    r = c.post("/api/brands", json={"name": name, "tokens": ACME})
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    bid, vid = body["brand"]["id"], body["version"]["id"]
    assert c.post(f"/api/brands/{bid}/versions/{vid}/activate").status_code == 200
    return bid, vid


def make_deck(c):
    return c.post("/api/presentations", json={"title": "Deck"}).get_json()["presentation"]["id"]


def test_decks_without_a_brand_are_unchanged(app_db):
    c = signed_in(app_db[0], "a@example.com")
    pid = make_deck(c)
    assert c.get(f"/api/presentations/{pid}").get_json()["presentation"]["brand"] is None


def test_brand_lifecycle_versions_and_deck_rendering_tokens(app_db):
    c = signed_in(app_db[0], "a@example.com")
    r = c.post("/api/brands", json={"name": "Acme Corp"})
    assert r.status_code == 201 and r.get_json()["brand"]["slug"] == "acme-corp" and r.get_json()["version"] is None
    bid = r.get_json()["brand"]["id"]

    v1 = c.post(f"/api/brands/{bid}/versions", json={"tokens": ACME}).get_json()["version"]
    assert v1["version"] == 1 and v1["status"] == "draft"
    pid = make_deck(c)
    # a draft brand can't be applied yet
    assert c.put(f"/api/presentations/{pid}/brand", json={"brand_id": bid}).status_code == 409

    assert c.post(f"/api/brands/{bid}/versions/{v1['id']}/activate").get_json()["brand"]["status"] == "active"
    # active versions are immutable
    r = c.put(f"/api/brands/{bid}/versions/{v1['id']}", json={"tokens": ACME})
    assert r.status_code == 409 and r.get_json()["code"] == "version_immutable"

    applied = c.put(f"/api/presentations/{pid}/brand", json={"brand_id": bid}).get_json()["brand"]
    assert applied["version"] == 1 and applied["themeOverrides"]["colors"]["primary"] == "#0A3D91"
    deck = c.get(f"/api/presentations/{pid}").get_json()["presentation"]
    assert deck["brand"]["id"] == bid and deck["brand"]["tokens"]["footer"]["enabled"] is True

    # a new active version doesn't silently change decks pinned to v1
    v2_tokens = json.loads(json.dumps(ACME))
    v2_tokens["colors"]["primary"] = [{"hex": "#000000"}]
    v2 = c.post(f"/api/brands/{bid}/versions", json={"tokens": v2_tokens}).get_json()["version"]
    assert c.put(f"/api/brands/{bid}/versions/{v2['id']}", json={"tokens": v2_tokens}).status_code == 200  # draft: editable
    c.post(f"/api/brands/{bid}/versions/{v2['id']}/activate")
    assert c.get(f"/api/presentations/{pid}").get_json()["presentation"]["brand"]["version"] == 1
    statuses = {v["version"]: v["status"] for v in c.get(f"/api/brands/{bid}").get_json()["versions"]}
    assert statuses == {1: "superseded", 2: "active"}

    # rollback: re-activate v1
    c.post(f"/api/brands/{bid}/versions/{v1['id']}/activate")
    assert c.get(f"/api/brands/{bid}").get_json()["activeTokens"]["colors"]["primary"][0]["hex"] == "#0A3D91"

    # duplicate keeps the brand; clearing removes it
    dup = c.post(f"/api/presentations/{pid}/duplicate").get_json()
    dup_id = (dup.get("presentation") or dup)["id"]
    assert c.get(f"/api/presentations/{dup_id}").get_json()["presentation"]["brand"]["id"] == bid
    assert c.put(f"/api/presentations/{pid}/brand", json={"brand_id": None}).get_json() == {"brand": None}
    assert c.get(f"/api/presentations/{pid}").get_json()["presentation"]["brand"] is None


def test_invalid_tokens_answer_400_with_problems(app_db):
    c = signed_in(app_db[0], "a@example.com")
    r = c.post("/api/brands", json={"name": "Bad", "tokens": {"colors": {"primary": [{"hex": "red"}]}}})
    assert r.status_code == 400 and r.get_json()["code"] == "invalid_tokens"
    assert r.get_json()["problems"][0]["path"] == "colors.primary.0.hex"


def test_only_admins_and_brand_managers_manage_brands(app_db):
    app = app_db[0]
    admin = signed_in(app, "admin@example.com")
    bid, vid = make_active_brand(admin)
    emp = join_as(app, admin, "emp@example.com", "employee")
    mgr = join_as(app, admin, "mgr@example.com", "brand_manager")

    assert emp.post("/api/brands", json={"name": "Mine"}).status_code == 403
    assert emp.post(f"/api/brands/{bid}/versions", json={"tokens": ACME}).status_code == 403
    assert emp.post(f"/api/brands/{bid}/versions/{vid}/activate").status_code == 403
    assert emp.patch(f"/api/brands/{bid}", json={"status": "archived"}).status_code == 403
    # employees can see brands and apply an active one to their deck
    assert [b["name"] for b in emp.get("/api/brands").get_json()["brands"]] == ["Acme"]
    pid = make_deck(emp)
    assert emp.put(f"/api/presentations/{pid}/brand", json={"brand_id": bid}).status_code == 200

    assert mgr.post("/api/brands", json={"name": "Sub-brand"}).status_code == 201
    assert mgr.patch(f"/api/brands/{bid}", json={"status": "archived"}).get_json()["brand"]["status"] == "archived"
    # archived brands can't be newly applied, but decks already using them keep rendering
    pid2 = make_deck(emp)
    assert emp.put(f"/api/presentations/{pid2}/brand", json={"brand_id": bid}).status_code == 409
    assert emp.get(f"/api/presentations/{pid}").get_json()["presentation"]["brand"]["id"] == bid


def test_other_orgs_cannot_see_or_use_a_brand(app_db):
    app = app_db[0]
    a = signed_in(app, "a@example.com")
    bid, vid = make_active_brand(a)
    b = signed_in(app, "b@example.com")  # a new signup gets its own org
    assert b.get("/api/brands").get_json()["brands"] == []
    assert b.get(f"/api/brands/{bid}").status_code == 404
    assert b.get(f"/api/brands/{bid}/versions/{vid}").status_code == 404
    assert b.post(f"/api/brands/{bid}/versions", json={"tokens": ACME}).status_code == 404
    assert b.post(f"/api/brands/{bid}/versions/{vid}/activate").status_code == 404
    pid_b = make_deck(b)
    assert b.put(f"/api/presentations/{pid_b}/brand", json={"brand_id": bid}).status_code == 404
    pid_a = make_deck(a)
    assert b.put(f"/api/presentations/{pid_a}/brand", json={"brand_id": None}).status_code == 404


def test_shared_decks_carry_their_brand(app_db):
    c = signed_in(app_db[0], "a@example.com")
    bid, _ = make_active_brand(c)
    pid = make_deck(c)
    c.put(f"/api/presentations/{pid}/brand", json={"brand_id": bid})
    token = c.post(f"/api/presentations/{pid}/share").get_json()["share_token"]
    anon = app_db[0].test_client()
    shared = anon.get(f"/api/share/{token}").get_json()["presentation"]
    assert shared["brand"]["themeOverrides"]["fonts"]["heading"] == "Acme Sans"


def test_brand_changes_are_audited(app_db):
    app, db = app_db
    c = signed_in(app, "a@example.com")
    bid, _ = make_active_brand(c)
    pid = make_deck(c)
    c.put(f"/api/presentations/{pid}/brand", json={"brand_id": bid})
    conn = sqlite3.connect(db)
    actions = [r[0] for r in conn.execute("SELECT action FROM brand_audit ORDER BY id")]
    conn.close()
    assert actions == ["brand.create", "version.create", "version.activate", "deck.brand_set"]
