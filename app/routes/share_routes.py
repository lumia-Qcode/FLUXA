import json

from flask import Blueprint, current_app

from app.brand.store import deck_brand
from app.database import get_connection
from app.models.presentation import Presentation, Slide

share_bp = Blueprint("share", __name__)


def parse_json_safely(val, default):
    if not val:
        return default
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


@share_bp.get("/<identifier>")
def get_shared_presentation(identifier):
    """Retrieve shared presentation by share token or presentation ID if shared."""
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute(
            """
            SELECT id, title, description, created_at, updated_at,
                   theme, datasets, variables, settings, schema_version, revision,
                   share_token, is_shared, org_id, brand_id, brand_version_id
            FROM presentations
            WHERE share_token = ?
            """,
            (identifier,),
        ).fetchone()

        if not row and identifier.isdigit():
            row = connection.execute(
                """
                SELECT id, title, description, created_at, updated_at,
                       theme, datasets, variables, settings, schema_version, revision,
                       share_token, is_shared, org_id, brand_id, brand_version_id
                FROM presentations
                WHERE id = ?
                """,
                (int(identifier),),
            ).fetchone()

        if not row:
            return {"error": "Presentation not found."}, 404

        if not row["is_shared"]:
            return {
                "error": "This presentation is no longer shared or the link has expired.",
                "code": "revoked",
            }, 403

        presentation_id = row["id"]
        slide_rows = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, created_at, updated_at, spec
            FROM slides
            WHERE presentation_id = ?
            ORDER BY slide_order ASC, id ASC
            """,
            (presentation_id,),
        ).fetchall()

        presentation = Presentation(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            theme=parse_json_safely(row["theme"], {"themeId": "default"}),
            datasets=parse_json_safely(row["datasets"], {}),
            variables=parse_json_safely(row["variables"], {}),
            settings=parse_json_safely(
                row["settings"], {"transition": {"effect": "fade", "duration": 300}, "loop": False}
            ),
            schema_version=row["schema_version"] or 1,
            revision=row["revision"] or 1,
            share_token=row["share_token"],
            is_shared=bool(row["is_shared"]),
        ).to_dict()

        presentation["slides"] = [
            Slide(
                id=s["id"],
                presentation_id=s["presentation_id"],
                slide_order=s["slide_order"],
                title=s["title"],
                content=s["content"],
                created_at=s["created_at"],
                updated_at=s["updated_at"],
                spec=parse_json_safely(s["spec"], None),
            ).to_dict()
            for s in slide_rows
        ]
        presentation["brand"] = deck_brand(connection, row["org_id"], row["brand_id"], row["brand_version_id"])

        return {"presentation": presentation}, 200
    finally:
        connection.close()
