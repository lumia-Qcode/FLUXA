import os

from dotenv import load_dotenv
from flask import Flask

from app.config import Config
from app.database import init_db
from app.routes.ai_routes import ai_bp
from app.routes.asset_routes import asset_bp
from app.routes.generation_routes import generation_bp
from app.routes.presentation_routes import presentation_bp
from app.routes.share_routes import share_bp
from app.routes.slide_routes import slide_bp


def create_app():
    load_dotenv()

    app = Flask(__name__)
    app.config.from_object(Config)

    os.makedirs(os.path.dirname(app.config["DATABASE_PATH"]), exist_ok=True)

    init_db(app.config["DATABASE_PATH"])

    app.register_blueprint(presentation_bp, url_prefix="/api/presentations")
    app.register_blueprint(slide_bp, url_prefix="/api/presentations")
    app.register_blueprint(generation_bp, url_prefix="/api/presentations")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(ai_bp, url_prefix="/api/presentations", name="ai_presentations")
    app.register_blueprint(share_bp, url_prefix="/api/share")
    app.register_blueprint(asset_bp)

    @app.get("/api/health")
    def health_check():
        return {"status": "success", "message": "FLUXA backend is running"}, 200

    return app
