"""Sign-in, organisations, roles and tenant isolation (app/auth.py)."""

import pytest

from app import auth
from app import create_app
from app.database import get_connection, init_db


@pytest.fixture
def app_db(tmp_path, anon_client_class):
    app = create_app()
    db_path = str(tmp_path / "auth.db")
    app.config.update(TESTING=True, DATABASE_PATH=db_path)
    init_db(db_path)
    auth._FAILED.clear()
    return app, db_path


def client(app):
    return app.test_client()


def signup(c, email, password="long-enough-pw", **extra):
    return c.post("/api/auth/signup", json={"email": email, "password": password, **extra})


def make_deck(c, title="Deck"):
    r = c.post("/api/presentations", json={"title": title})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["presentation"]["id"]


def test_api_requires_sign_in_but_health_is_public(app_db):
    c = client(app_db[0])
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/presentations").status_code == 401
    assert c.post("/api/presentations", json={"title": "x"}).status_code == 401
    assert c.get("/api/auth/me").status_code == 401


def test_first_account_is_admin_and_claims_existing_decks(app_db):
    app, db_path = app_db
    conn = get_connection(db_path)
    conn.execute("INSERT INTO presentations (title) VALUES ('Made before accounts')")
    conn.commit()
    conn.close()

    c = client(app)
    r = signup(c, "Owner@Example.com", name="Owner")
    assert r.status_code == 201
    body = r.get_json()
    assert body["role"] == "admin" and body["user"]["email"] == "owner@example.com"
    titles = [p["title"] for p in c.get("/api/presentations").get_json()["presentations"]]
    assert titles == ["Made before accounts"]


def test_other_organisations_cannot_see_or_touch_a_deck(app_db):
    app, _ = app_db
    a = client(app)
    signup(a, "a@example.com")
    deck = make_deck(a, "A's deck")
    slide = a.post(f"/api/presentations/{deck}/slides", json={"title": "s", "content": "c"})
    assert slide.status_code == 201

    b = client(app)
    signup(b, "b@example.com")
    assert b.get("/api/presentations").get_json()["presentations"] == []
    for method, url in [
        ("get", f"/api/presentations/{deck}"),
        ("put", f"/api/presentations/{deck}"),
        ("delete", f"/api/presentations/{deck}"),
        ("post", f"/api/presentations/{deck}/duplicate"),
        ("get", f"/api/presentations/{deck}/slides"),
        ("post", f"/api/presentations/{deck}/share"),
        ("get", f"/api/presentations/{deck}/ai/messages"),
    ]:
        r = getattr(b, method)(url, json={"title": "hijack"})
        assert r.status_code == 404, (method, url, r.status_code)
    assert b.post("/api/live/sessions", json={"presentation_id": deck}).status_code == 404
    # A still has it, unchanged.
    assert a.get(f"/api/presentations/{deck}").get_json()["presentation"]["title"] == "A's deck"


def test_invite_joins_org_with_role_and_roles_are_enforced(app_db):
    app, _ = app_db
    admin = client(app)
    signup(admin, "admin@example.com")
    deck = make_deck(admin, "Shared within org")

    inv = admin.post("/api/org/invites", json={"role": "employee", "email": "emp@example.com"})
    assert inv.status_code == 201
    token = inv.get_json()["token"]
    assert admin.get(f"/api/auth/invites/{token}").get_json()["role"] == "employee"

    emp = client(app)
    assert signup(emp, "other@example.com", invite=token).status_code == 400  # wrong email
    r = signup(emp, "emp@example.com", invite=token)
    assert r.status_code == 201 and r.get_json()["role"] == "employee"
    assert signup(client(app), "again@example.com", invite=token).status_code == 400  # single use

    assert emp.get(f"/api/presentations/{deck}").status_code == 200
    assert emp.delete(f"/api/presentations/{deck}").status_code == 403  # not owner, not admin
    assert emp.post("/api/org/invites", json={"role": "admin"}).status_code == 403
    own = make_deck(emp, "Employee deck")
    assert emp.delete(f"/api/presentations/{own}").status_code == 200  # owners may delete

    members = admin.get("/api/org/members").get_json()["members"]
    assert {m["email"]: m["role"] for m in members} == {"admin@example.com": "admin", "emp@example.com": "employee"}
    emp_id = next(m["id"] for m in members if m["role"] == "employee")
    assert admin.patch(f"/api/org/members/{emp_id}", json={"role": "brand_manager"}).get_json()["role"] == "brand_manager"


def test_last_admin_cannot_be_removed_or_demoted(app_db):
    app, _ = app_db
    admin = client(app)
    me = signup(admin, "solo@example.com").get_json()["user"]["id"]
    assert admin.patch(f"/api/org/members/{me}", json={"role": "employee"}).status_code == 400
    assert admin.delete(f"/api/org/members/{me}").status_code == 400


def test_login_logout_and_bad_passwords(app_db):
    app, _ = app_db
    c = client(app)
    signup(c, "user@example.com", password="right-password")
    c.post("/api/auth/logout")
    assert c.get("/api/presentations").status_code == 401

    assert c.post("/api/auth/login", json={"email": "user@example.com", "password": "nope"}).status_code == 401
    ok = c.post("/api/auth/login", json={"email": "USER@example.com", "password": "right-password"})
    assert ok.status_code == 200
    assert c.get("/api/presentations").status_code == 200


def test_repeated_wrong_passwords_lock_the_account_temporarily(app_db):
    app, _ = app_db
    c = client(app)
    signup(c, "victim@example.com", password="right-password")
    for _ in range(auth.MAX_FAILURES):
        c.post("/api/auth/login", json={"email": "victim@example.com", "password": "guess"})
    r = c.post("/api/auth/login", json={"email": "victim@example.com", "password": "right-password"})
    assert r.status_code == 429


def test_signup_validation(app_db):
    c = client(app_db[0])
    assert signup(c, "not-an-email").status_code == 400
    assert signup(c, "short@example.com", password="short").status_code == 400
    assert signup(c, "dup@example.com").status_code == 201
    assert signup(client(app_db[0]), "dup@example.com").status_code == 409


def test_cross_site_writes_are_refused(app_db):
    app, _ = app_db
    c = client(app)
    signup(c, "csrf@example.com")
    r = c.post("/api/presentations", json={"title": "x"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert c.post("/api/presentations", json={"title": "x"}, headers={"Origin": "http://localhost"}).status_code == 201
    # The Vite dev server proxies with a rewritten Host; its origin is trusted by default.
    assert c.post("/api/presentations", json={"title": "x"}, headers={"Origin": "http://localhost:5173"}).status_code == 201
    # Vite moves to another port when 5173 is busy; loopback pages on this machine are allowed...
    assert c.post("/api/presentations", json={"title": "x"}, headers={"Origin": "http://localhost:5174"}).status_code == 201
    # ...but not when the request comes from another machine.
    r = c.post("/api/presentations", json={"title": "x"}, headers={"Origin": "http://localhost:5174"},
               environ_base={"REMOTE_ADDR": "10.0.0.5"})
    assert r.status_code == 403


def test_session_cookie_is_httponly_and_samesite(app_db):
    c = client(app_db[0])
    r = signup(c, "cookie@example.com")
    cookie = r.headers.get("Set-Cookie", "")
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie


def test_share_links_and_live_audience_stay_public(app_db):
    app, _ = app_db
    host = client(app)
    signup(host, "host@example.com")
    deck = make_deck(host, "Public talk")
    token = host.post(f"/api/presentations/{deck}/share").get_json().get("share_token")
    session = host.post("/api/live/sessions", json={"presentation_id": deck}).get_json()

    visitor = client(app)
    assert visitor.get(f"/api/share/{token}").status_code == 200
    code = session.get("meeting_code") or session.get("session", {}).get("meeting_code")
    sid = session.get("session_id") or session.get("id") or session.get("session", {}).get("id")
    assert visitor.get(f"/api/live/by-code/{code}").status_code == 200
    join = {"name": "Guest", "accept_notice": True, "notice_version": 1}
    assert visitor.post(f"/api/live/sessions/{sid}/join", json=join).status_code in (200, 201)
    # Host-only live actions still need an account.
    assert visitor.post(f"/api/live/sessions/{sid}/end").status_code == 401
