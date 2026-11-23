import netrc
import os

from dotenv import load_dotenv
from flask import Flask

from app.auth import auth_bp, guard_request, org_bp
from app.brand.routes import brand_bp, deck_brand_bp
from app.config import Config
from app.ai.deck_features import features_bp
from app.database import init_db
from app.ingest.routes import uploads_bp
from app.jobs.routes import jobs_bp
from app.privacy.routes import privacy_bp
from app.routes.ai_routes import ai_bp
from app.routes.asset_routes import asset_bp
from app.routes.generation_routes import generation_bp
from app.routes.live_routes import live_bp
from app.routes.presentation_routes import presentation_bp
from app.routes.share_routes import share_bp
from app.routes.slide_routes import slide_bp


def _local_secret_key(instance_dir):
    """A random key generated once and kept beside the database (development only)."""
    import secrets

    path = os.path.join(instance_dir or ".", "secret_key")
    try:
        with open(path, encoding="utf-8") as fh:
            key = fh.read().strip()
            if key:
                return key
    except FileNotFoundError:
        pass
    key = secrets.token_hex(32)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(key)
    return key


def _maybe_start_job_worker(app):
    """Run background jobs in this process (F12), unless JOBS_WORKER=0.

    With the debug reloader, only the child process that serves requests runs the worker.
    """
    if os.getenv("JOBS_WORKER", "1") == "0":
        return
    if app.config.get("DEBUG") and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return
    from app.jobs.worker import start_worker

    start_worker(app.config["DATABASE_PATH"], concurrency=int(os.getenv("JOBS_CONCURRENCY", "2")))


def create_app():
    from app.ai.net import prefer_ipv4

    prefer_ipv4()  # broken IPv6 routes stall Wikipedia/Wikimedia requests ~21 s each
    basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    load_dotenv(os.path.join(basedir, ".env"))

    app = Flask(__name__)
    app.config.from_object(Config)
    # One request body at most: a 30-file upload batch (F13); the largest file type allows 50 MB each.
    if not app.config.get("MAX_CONTENT_LENGTH"):
        app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024

    os.makedirs(os.path.dirname(app.config["DATABASE_PATH"]), exist_ok=True)
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = _local_secret_key(os.path.dirname(app.config["DATABASE_PATH"]))

    init_db(app.config["DATABASE_PATH"])

    app.register_blueprint(presentation_bp, url_prefix="/api/presentations")
    app.register_blueprint(slide_bp, url_prefix="/api/presentations")
    app.register_blueprint(generation_bp, url_prefix="/api/presentations")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(ai_bp, url_prefix="/api/presentations", name="ai_presentations")
    app.register_blueprint(share_bp, url_prefix="/api/share")
    app.register_blueprint(live_bp, url_prefix="/api/live")
    app.register_blueprint(asset_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(org_bp, url_prefix="/api/org")
    app.register_blueprint(brand_bp, url_prefix="/api/brands")
    app.register_blueprint(deck_brand_bp, url_prefix="/api/presentations")
    app.register_blueprint(jobs_bp, url_prefix="/api/jobs")
    app.register_blueprint(uploads_bp, url_prefix="/api/uploads")
    app.register_blueprint(privacy_bp, url_prefix="/api/privacy")
    app.register_blueprint(features_bp, url_prefix="/api/presentations")

    # Sign-in and tenant checks for every /api request (app/auth.py).
    app.before_request(guard_request)

    _maybe_start_job_worker(app)

    @app.get("/api/health")
    def health_check():
        return {"status": "success", "message": "FLUXA backend is running"}, 200

    return app
