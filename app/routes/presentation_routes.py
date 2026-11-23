import json

from flask import Blueprint, current_app, g, request
from pydantic import ValidationError

from app.auth import can_delete_deck
from app.brand.store import deck_brand, deck_brand_for
from app.database import get_connection
from app.models.presentation import Presentation, Slide
from app.spec.models import Dataset, DeckSettings, Variable

presentation_bp = Blueprint("presentations", __name__)

_COLUMN_TYPES = {"string": "text", "str": "text", "category": "text", "int": "number", "float": "number",
                 "numeric": "number", "datetime": "date"}


def normalize_datasets(datasets):
    """Repair datasets written by older generator versions so their decks can be saved:
    columns used `name` instead of `label` and type "string" instead of "text"."""
    if not isinstance(datasets, dict):
        return datasets
    out = {}
    for key, ds in datasets.items():
        if isinstance(ds, dict) and isinstance(ds.get("columns"), list):
            ds = dict(ds)
            cols = []
            for col in ds["columns"]:
                if isinstance(col, dict):
                    col = dict(col)
                    if "label" not in col:
                        col["label"] = str(col.pop("name", None) or col.get("key") or "")
                    else:
                        col.pop("name", None)
                    t = str(col.get("type") or "text").lower()
                    col["type"] = _COLUMN_TYPES.get(t, t if t in ("text", "number", "date") else "text")
                cols.append(col)
            ds["columns"] = cols
            ds.setdefault("id", key)
            ds.setdefault("name", key)
            ds.setdefault("source", "ai-estimate")
        out[key] = ds
    return out


def parse_json_safely(val, default):
    if not val:
        return default
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


@presentation_bp.post("")
def create_presentation():
    data = request.get_json(silent=True)

    if not data:
        return {"error": "Request body must contain JSON data."}, 400

    title = data.get("title")
    description = data.get("description", "")
    theme = data.get("theme", {"themeId": "default"})
    datasets = data.get("datasets", {})
    variables = data.get("variables", {})
    settings = data.get(
        "settings", {"transition": {"effect": "fade", "duration": 300}, "loop": False}
    )

    if not title or not isinstance(title, str):
        return {"error": "The 'title' field is required and must be a string."}, 400

    title = title.strip()
    if not title:
        return {"error": "The 'title' field cannot be empty."}, 400

    if not isinstance(description, str):
        return {"error": "The 'description' field must be a string."}, 400

    # Validate datasets & variables with Pydantic if provided
    try:
        for k, v in datasets.items():
            Dataset.model_validate(v)
        for k, v in variables.items():
            Variable.model_validate(v)
        DeckSettings.model_validate(settings)
    except ValidationError as e:
        return {"error": "Validation error in presentation data", "details": e.errors()}, 422

    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        cursor = connection.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision, org_id, owner_id)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
            """,
            (
                title,
                description,
                json.dumps(theme),
                json.dumps(datasets),
                json.dumps(variables),
                json.dumps(settings),
                g.org_id,
                g.user_id,
            ),
        )
        presentation_id = cursor.lastrowid
        connection.commit()

        row = connection.execute(
            """
            SELECT id, title, description, created_at, updated_at,
                   theme, datasets, variables, settings, schema_version, revision
            FROM presentations
            WHERE id = ?
            """,
            (presentation_id,),
        ).fetchone()
    finally:
        connection.close()

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
    )

    return {
        "message": "Presentation created successfully",
        "presentation": presentation.to_dict(),
    }, 201


@presentation_bp.get("")
def list_presentations():
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        rows = connection.execute(
            """
            SELECT p.id, p.title, p.description,
                   p.created_at, p.updated_at,
                   p.theme, p.datasets, p.variables, p.settings,
                   p.schema_version, p.revision,
                   COUNT(s.id) AS slide_count
            FROM presentations p
            LEFT JOIN slides s ON s.presentation_id = p.id
            WHERE p.org_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC, p.id DESC
            """,
            (g.org_id,),
        ).fetchall()

        first_slides = {}
        slide_rows = connection.execute(
            """
            SELECT s.presentation_id, s.id, s.title, s.content, s.spec
            FROM slides s
            INNER JOIN (
                SELECT presentation_id, MIN(slide_order) as min_order
                FROM slides
                GROUP BY presentation_id
            ) m ON s.presentation_id = m.presentation_id AND s.slide_order = m.min_order
            """
        ).fetchall()
        for s in slide_rows:
            if s["presentation_id"] not in first_slides:
                first_slides[s["presentation_id"]] = {
                    "id": s["id"],
                    "title": s["title"],
                    "content": s["content"],
                    "spec": parse_json_safely(s["spec"], None),
                }
    finally:
        connection.close()

    presentations = []
    for row in rows:
        item = Presentation(
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
        ).to_dict()
        item["slide_count"] = row["slide_count"]
        item["first_slide"] = first_slides.get(row["id"])
        presentations.append(item)

    return {"count": len(presentations), "presentations": presentations}, 200


@presentation_bp.get("/<int:presentation_id>")
def get_presentation(presentation_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        row = connection.execute(
            """
            SELECT id, title, description, created_at, updated_at,
                   theme, datasets, variables, settings, schema_version, revision,
                   share_token, is_shared, org_id, brand_id, brand_version_id
            FROM presentations
            WHERE id = ?
            """,
            (presentation_id,),
        ).fetchone()

        if row is None:
            return {"error": "Presentation not found."}, 404
        brand = deck_brand(connection, row["org_id"], row["brand_id"], row["brand_version_id"])

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
    finally:
        connection.close()

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

    slides = [
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

    presentation["slides"] = slides
    presentation["slide_count"] = len(slides)
    presentation["brand"] = brand

    return {"presentation": presentation}, 200


@presentation_bp.post("/<int:presentation_id>/share")
def create_share_link(presentation_id):
    """Enable sharing and generate an unguessable share token."""
    import secrets

    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute(
            "SELECT id, share_token, is_shared FROM presentations WHERE id = ?",
            (presentation_id,),
        ).fetchone()
        if not row:
            return {"error": "Presentation not found."}, 404

        token = row["share_token"]
        if not token:
            token = secrets.token_urlsafe(16)

        connection.execute(
            """
            UPDATE presentations
            SET share_token = ?, is_shared = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (token, presentation_id),
        )
        connection.commit()
        return {
            "share_token": token,
            "share_url": f"/v/{token}",
            "is_shared": True,
        }, 200
    finally:
        connection.close()


@presentation_bp.delete("/<int:presentation_id>/share")
def revoke_share_link(presentation_id):
    """Revoke sharing for a presentation."""
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute(
            "SELECT id FROM presentations WHERE id = ?",
            (presentation_id,),
        ).fetchone()
        if not row:
            return {"error": "Presentation not found."}, 404

        connection.execute(
            """
            UPDATE presentations
            SET is_shared = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (presentation_id,),
        )
        connection.commit()
        return {
            "message": "Share link has been revoked.",
            "is_shared": False,
        }, 200
    finally:
        connection.close()


@presentation_bp.route("/<int:presentation_id>", methods=["PUT", "PATCH"])
def update_presentation(presentation_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return {"error": "Request body must contain JSON data."}, 400

    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        existing = connection.execute(
            """
            SELECT id, title, description, theme, datasets, variables, settings,
                   schema_version, revision
            FROM presentations
            WHERE id = ?
            """,
            (presentation_id,),
        ).fetchone()

        if existing is None:
            return {"error": "Presentation not found."}, 404

        current_rev = existing["revision"] or 1

        # Revision check (concurrency guard returning 409)
        client_rev = data.get("revision")
        force = data.get("force", False)
        if not force and client_rev is not None and client_rev != current_rev:
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
            server_presentation = Presentation(
                id=existing["id"],
                title=existing["title"],
                description=existing["description"],
                theme=parse_json_safely(existing["theme"], {"themeId": "default"}),
                datasets=parse_json_safely(existing["datasets"], {}),
                variables=parse_json_safely(existing["variables"], {}),
                settings=parse_json_safely(existing["settings"], {}),
                schema_version=existing["schema_version"] or 1,
                revision=current_rev,
            ).to_dict()
            server_presentation["slides"] = [
                Slide(
                    id=s["id"],
                    presentation_id=s["presentation_id"],
                    slide_order=s["slide_order"],
                    title=s["title"],
                    content=s["content"],
                    spec=parse_json_safely(s["spec"], None),
                ).to_dict()
                for s in slide_rows
            ]
            return {
                "error": "Conflict: presentation was modified elsewhere",
                "current_revision": current_rev,
                "presentation": server_presentation,
            }, 409

        fields = []
        values = []

        if "title" in data:
            title = data["title"]
            if not isinstance(title, str) or not title.strip():
                return {"error": "The 'title' field must be a non-empty string."}, 400
            fields.append("title = ?")
            values.append(title.strip())

        if "description" in data:
            desc = data["description"]
            if not isinstance(desc, str):
                return {"error": "The 'description' field must be a string."}, 400
            fields.append("description = ?")
            values.append(desc)

        if "theme" in data:
            fields.append("theme = ?")
            values.append(json.dumps(data["theme"]))

        if "datasets" in data:
            datasets = normalize_datasets(data["datasets"])
            data["datasets"] = datasets
            try:
                for k, v in datasets.items():
                    # Generated decks also keep research notes (sources, chart drafts) here;
                    # only entries shaped like a dataset are datasets.
                    if not isinstance(v, dict) or "columns" in v or "rows" in v:
                        Dataset.model_validate(v)
            except ValidationError as e:
                return {"error": "Invalid dataset schema", "details": e.errors()}, 422
            fields.append("datasets = ?")
            values.append(json.dumps(datasets))

        if "variables" in data:
            variables = data["variables"]
            try:
                for k, v in variables.items():
                    # Generated decks also keep research notes here; validate real variables only.
                    if isinstance(v, dict) and ("type" in v or "value" in v):
                        Variable.model_validate(v)
            except ValidationError as e:
                return {"error": "Invalid variable schema", "details": e.errors()}, 422
            fields.append("variables = ?")
            values.append(json.dumps(variables))

        if "settings" in data:
            settings = data["settings"]
            try:
                DeckSettings.model_validate(settings)
            except ValidationError as e:
                return {"error": "Invalid deck settings schema", "details": e.errors()}, 422
            fields.append("settings = ?")
            values.append(json.dumps(settings))

        # Bump revision on update
        new_rev = current_rev + 1
        fields.append("revision = ?")
        values.append(new_rev)
        fields.append("updated_at = CURRENT_TIMESTAMP")

        values.append(presentation_id)
        connection.execute(
            f"UPDATE presentations SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        connection.commit()

        updated_row = connection.execute(
            """
            SELECT id, title, description, created_at, updated_at,
                   theme, datasets, variables, settings, schema_version, revision
            FROM presentations
            WHERE id = ?
            """,
            (presentation_id,),
        ).fetchone()
        brand = deck_brand_for(connection, presentation_id)
    finally:
        connection.close()

    presentation = Presentation(
        id=updated_row["id"],
        title=updated_row["title"],
        description=updated_row["description"],
        created_at=updated_row["created_at"],
        updated_at=updated_row["updated_at"],
        theme=parse_json_safely(updated_row["theme"], {"themeId": "default"}),
        datasets=parse_json_safely(updated_row["datasets"], {}),
        variables=parse_json_safely(updated_row["variables"], {}),
        settings=parse_json_safely(
            updated_row["settings"],
            {"transition": {"effect": "fade", "duration": 300}, "loop": False},
        ),
        schema_version=updated_row["schema_version"] or 1,
        revision=updated_row["revision"] or new_rev,
    ).to_dict()
    presentation["brand"] = brand

    return {"message": "Presentation updated successfully", "presentation": presentation}, 200


@presentation_bp.delete("/<int:presentation_id>")
def delete_presentation(presentation_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        row = connection.execute(
            "SELECT id, owner_id FROM presentations WHERE id = ?", (presentation_id,)
        ).fetchone()
        if row is None:
            return {"error": "Presentation not found."}, 404
        if not can_delete_deck(row["owner_id"]):
            return {"error": "Only the deck's owner or an admin can delete it.", "code": "forbidden"}, 403

        connection.execute("DELETE FROM slides WHERE presentation_id = ?", (presentation_id,))
        connection.execute("DELETE FROM presentations WHERE id = ?", (presentation_id,))
        connection.commit()
    finally:
        connection.close()

    return {"message": "Presentation deleted successfully"}, 200


@presentation_bp.post("/<int:presentation_id>/duplicate")
def duplicate_presentation(presentation_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = connection.execute(
            """
            SELECT id, title, description, theme, datasets, variables, settings, schema_version,
                   brand_id, brand_version_id
            FROM presentations WHERE id = ?
            """,
            (presentation_id,),
        ).fetchone()
        if row is None:
            return {"error": "Presentation not found."}, 404

        cur = connection.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision,
                                       org_id, owner_id, brand_id, brand_version_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            """,
            (
                f"{row['title']} (Copy)",
                row["description"],
                row["theme"],
                row["datasets"],
                row["variables"],
                row["settings"],
                row["schema_version"] or 1,
                g.org_id,
                g.user_id,
                row["brand_id"],
                row["brand_version_id"],
            ),
        )
        new_id = cur.lastrowid

        slides = connection.execute(
            "SELECT slide_order, title, content, spec FROM slides WHERE presentation_id = ? ORDER BY slide_order ASC",
            (presentation_id,),
        ).fetchall()

        for s in slides:
            connection.execute(
                "INSERT INTO slides (presentation_id, slide_order, title, content, spec) VALUES (?, ?, ?, ?, ?)",
                (new_id, s["slide_order"], s["title"], s["content"], s["spec"]),
            )

        connection.commit()
    finally:
        connection.close()

    return {"message": "Presentation duplicated", "id": new_id}, 201
