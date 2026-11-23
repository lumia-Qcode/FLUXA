import json

from flask import Blueprint, current_app, request
from pydantic import ValidationError

from app.database import get_connection
from app.models.presentation import Slide
from app.spec.models import SlideModel

logger = __import__("logging").getLogger(__name__)
MAX_BLOCKS = 200
# Block types the renderer can draw (frontend/src/rendering/blocks/BlockRenderer.tsx).
RENDERABLE_TYPES = {
    "text", "shape", "image", "icon", "chart", "kpi", "table", "steps", "timeline", "comparison", "quote",
    "control", "embed", "html", "tabs", "citation", "funnel", "swot", "market-size", "tam-sam-som", "model3d", "3d",
}


def check_slide_spec(spec):
    """Return validation errors for a slide spec, or None if it may be saved.

    The strict schema (SlideModel) predates parts of what the generator writes (citation
    blocks, newer layouts, text KPI deltas, background without colour), and rejecting those
    discarded every edit to a generated slide. A spec that fails the strict check is still
    accepted when its structure is sound, and stored exactly as sent.
    """
    try:
        SlideModel.model_validate(spec)
        return None
    except ValidationError as e:
        strict_errors = e.errors()
    problems = []
    if not isinstance(spec, dict):
        return [{"loc": [], "msg": "The slide must be a JSON object."}]
    blocks = spec.get("blocks", [])
    if not isinstance(blocks, list):
        problems.append({"loc": ["blocks"], "msg": "blocks must be a list"})
    elif len(blocks) > MAX_BLOCKS:
        problems.append({"loc": ["blocks"], "msg": f"at most {MAX_BLOCKS} blocks per slide"})
    else:
        for i, b in enumerate(blocks):
            if not isinstance(b, dict) or not b.get("id") or not isinstance(b.get("type"), str):
                problems.append({"loc": ["blocks", i], "msg": "each block needs an id and a type"})
                continue
            if b["type"] not in RENDERABLE_TYPES:
                problems.append({"loc": ["blocks", i, "type"], "msg": f"unknown block type '{b['type']}'"})
            for k in ("x", "y", "w", "h"):
                if k in b and b[k] is not None and not isinstance(b[k], (int, float)):
                    problems.append({"loc": ["blocks", i, k], "msg": "must be a number"})
            for k in ("w", "h"):
                if isinstance(b.get(k), (int, float)) and b[k] <= 0:
                    problems.append({"loc": ["blocks", i, k], "msg": "must be greater than 0"})
    if problems:
        return problems
    logger.info("slide spec accepted outside the strict schema (%d differences)", len(strict_errors))
    return None

slide_bp = Blueprint("slides", __name__)


def parse_json_safely(val, default=None):
    if not val:
        return default
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


def row_to_slide(row):
    return Slide(
        id=row["id"],
        presentation_id=row["presentation_id"],
        slide_order=row["slide_order"],
        title=row["title"],
        content=row["content"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        spec=parse_json_safely(row["spec"], None),
    )


def presentation_exists(connection, presentation_id):
    row = connection.execute(
        "SELECT id FROM presentations WHERE id = ?",
        (presentation_id,),
    ).fetchone()
    return row is not None


def bump_presentation_revision(connection, presentation_id):
    connection.execute(
        "UPDATE presentations SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (presentation_id,),
    )


@slide_bp.post("/<int:presentation_id>/slides")
def add_slide(presentation_id):
    data = request.get_json(silent=True)

    if not data or not isinstance(data, dict):
        return {"error": "Request body must contain JSON data."}, 400

    title = data.get("title", "")
    content = data.get("content", "")
    slide_order = data.get("slide_order")
    spec = data.get("spec")

    if not isinstance(title, str):
        return {"error": "The 'title' field must be a string."}, 400

    if not isinstance(content, str):
        return {"error": "The 'content' field must be a string."}, 400

    if slide_order is not None:
        if not isinstance(slide_order, int) or isinstance(slide_order, bool) or slide_order < 1:
            return {"error": "The 'slide_order' field must be a positive integer."}, 400

    title = title.strip()

    # Validate slide spec if provided
    if spec is not None:
        errors = check_slide_spec(spec)
        if errors:
            return {"error": "Invalid slide specification", "details": errors}, 422

    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        max_order = connection.execute(
            """
            SELECT COALESCE(MAX(slide_order), 0) AS max_order
            FROM slides
            WHERE presentation_id = ?
            """,
            (presentation_id,),
        ).fetchone()["max_order"]

        if slide_order is None or slide_order > max_order + 1:
            slide_order = max_order + 1
        else:
            connection.execute(
                """
                UPDATE slides
                SET slide_order = slide_order + 1
                WHERE presentation_id = ?
                  AND slide_order >= ?
                """,
                (presentation_id, slide_order),
            )

        spec_json = json.dumps(spec) if spec is not None else None
        cursor = connection.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (presentation_id, slide_order, title, content, spec_json),
        )

        slide_id = cursor.lastrowid
        bump_presentation_revision(connection, presentation_id)
        connection.commit()

        row = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, created_at, updated_at, spec
            FROM slides
            WHERE id = ?
            """,
            (slide_id,),
        ).fetchone()

        slide = row_to_slide(row)
    finally:
        connection.close()

    return {"message": "Slide added successfully", "slide": slide.to_dict()}, 201


@slide_bp.route("/<int:presentation_id>/slides/<int:slide_id>", methods=["PUT", "PATCH"])
def update_slide(presentation_id, slide_id):
    data = request.get_json(silent=True)

    if not data or not isinstance(data, dict):
        return {"error": "Request body must contain JSON data."}, 400

    if "title" not in data and "content" not in data and "spec" not in data:
        return {"error": "Provide at least one of 'title', 'content', or 'spec'."}, 400

    fields = []
    values = []

    if "title" in data:
        if not isinstance(data["title"], str):
            return {"error": "The 'title' field must be a string."}, 400
        fields.append("title = ?")
        values.append(data["title"].strip())

    if "content" in data:
        if not isinstance(data["content"], str):
            return {"error": "The 'content' field must be a string."}, 400
        fields.append("content = ?")
        values.append(data["content"])

    if "spec" in data:
        spec = data["spec"]
        if spec is not None:
            errors = check_slide_spec(spec)
            if errors:
                return {"error": "Invalid slide specification", "details": errors}, 422
            fields.append("spec = ?")
            values.append(json.dumps(spec))
        else:
            fields.append("spec = ?")
            values.append(None)

    fields.append("updated_at = CURRENT_TIMESTAMP")

    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        existing = connection.execute(
            """
            SELECT id FROM slides
            WHERE id = ? AND presentation_id = ?
            """,
            (slide_id, presentation_id),
        ).fetchone()

        if existing is None:
            return {"error": "Slide not found."}, 404

        connection.execute(
            f"""
            UPDATE slides
            SET {", ".join(fields)}
            WHERE id = ? AND presentation_id = ?
            """,
            (*values, slide_id, presentation_id),
        )

        bump_presentation_revision(connection, presentation_id)
        connection.commit()

        row = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, created_at, updated_at, spec
            FROM slides
            WHERE id = ?
            """,
            (slide_id,),
        ).fetchone()

        slide = row_to_slide(row)
    finally:
        connection.close()

    return {"message": "Slide updated successfully", "slide": slide.to_dict()}, 200


@slide_bp.get("/<int:presentation_id>/slides")
def list_slides(presentation_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        rows = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, created_at, updated_at, spec
            FROM slides
            WHERE presentation_id = ?
            ORDER BY slide_order ASC, id ASC
            """,
            (presentation_id,),
        ).fetchall()

        slides = [row_to_slide(row).to_dict() for row in rows]
    finally:
        connection.close()

    return {"presentation_id": presentation_id, "count": len(slides), "slides": slides}, 200


@slide_bp.get("/<int:presentation_id>/slides/<int:slide_id>")
def get_slide(presentation_id, slide_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        row = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, created_at, updated_at, spec
            FROM slides
            WHERE id = ? AND presentation_id = ?
            """,
            (slide_id, presentation_id),
        ).fetchone()

        if row is None:
            return {"error": "Slide not found."}, 404

        slide = row_to_slide(row)
    finally:
        connection.close()

    return {"slide": slide.to_dict()}, 200


@slide_bp.delete("/<int:presentation_id>/slides/<int:slide_id>")
def delete_slide(presentation_id, slide_id):
    connection = get_connection(current_app.config["DATABASE_PATH"])

    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        existing = connection.execute(
            """
            SELECT id FROM slides
            WHERE id = ? AND presentation_id = ?
            """,
            (slide_id, presentation_id),
        ).fetchone()

        if existing is None:
            return {"error": "Slide not found."}, 404

        connection.execute(
            "DELETE FROM slides WHERE id = ? AND presentation_id = ?",
            (slide_id, presentation_id),
        )

        bump_presentation_revision(connection, presentation_id)
        connection.commit()
    finally:
        connection.close()

    return {"message": "Slide deleted successfully"}, 200


@slide_bp.post("/<int:presentation_id>/slides/reorder")
def reorder_slides(presentation_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict) or "slide_ids" not in data:
        return {"error": "Request body must contain 'slide_ids' list."}, 400

    slide_ids = data["slide_ids"]
    if not isinstance(slide_ids, list):
        return {"error": "'slide_ids' must be a list of integers."}, 400

    connection = get_connection(current_app.config["DATABASE_PATH"])
    try:
        if not presentation_exists(connection, presentation_id):
            return {"error": "Presentation not found."}, 404

        for order, sid in enumerate(slide_ids, start=1):
            connection.execute(
                "UPDATE slides SET slide_order = ? WHERE id = ? AND presentation_id = ?",
                (order, sid, presentation_id),
            )

        bump_presentation_revision(connection, presentation_id)
        connection.commit()
    finally:
        connection.close()

    return {"message": "Slides reordered successfully"}, 200
