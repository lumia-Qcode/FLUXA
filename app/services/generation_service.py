"""FT-12 - Orchestrates T24-T27: prompt -> outline -> content -> slide data."""

import json

from app.database import get_connection
from app.services.outline_service import generate_outline
from app.services.slide_content_service import generate_slide_content
from app.services.slide_parser import to_slide_records


def generate_structured_slides(
    topic: str,
    slide_count: int = 8,
    audience: str = "General audience",
    language: str = "English",
) -> dict:
    """Run the legacy AI pipeline and return
    {"title": str, "slides": [{slide_order, title, content}]}."""

    outline = generate_outline(topic, slide_count, audience, language)
    slides = generate_slide_content(topic, outline, audience, language)

    return {
        "title": outline["title"],
        "slides": to_slide_records(slides),
    }


def save_generated_presentation(
    database_path: str,
    title: str,
    description: str,
    slides: list,
    theme: dict = None,
    datasets: dict = None,
    variables: dict = None,
    org_id: int = None,
    owner_id: int = None,
) -> dict:
    """Store a generated presentation and its slides; return the saved rows."""

    connection = get_connection(database_path)

    try:
        theme_json = json.dumps(theme) if theme else json.dumps({"themeId": "default"})
        datasets_json = json.dumps(datasets) if datasets else "{}"
        variables_json = json.dumps(variables) if variables else "{}"

        cursor = connection.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, org_id, owner_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (title, description, theme_json, datasets_json, variables_json, org_id, owner_id),
        )
        presentation_id = cursor.lastrowid

        insert_params = []
        for s in slides:
            spec_val = None
            if "spec" in s and s["spec"]:
                spec_val = json.dumps(s["spec"]) if isinstance(s["spec"], dict) else s["spec"]

            # Content string for backwards compatibility
            content_val = s.get("content", "")
            if not content_val and spec_val:
                content_val = "- Generated slide"

            insert_params.append(
                (
                    presentation_id,
                    s["slide_order"],
                    s["title"],
                    content_val,
                    spec_val,
                )
            )

        connection.executemany(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            insert_params,
        )
        connection.commit()

        presentation = dict(
            connection.execute(
                """
            SELECT id, title, description, theme, datasets, variables, settings,
                   schema_version, revision, created_at, updated_at
            FROM presentations WHERE id = ?
            """,
                (presentation_id,),
            ).fetchone()
        )

        slide_rows = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title,
                   content, spec, created_at, updated_at
            FROM slides WHERE presentation_id = ?
            ORDER BY slide_order ASC, id ASC
            """,
            (presentation_id,),
        ).fetchall()
    finally:
        connection.close()

    parsed_slides = []
    for r in slide_rows:
        row_dict = dict(r)
        if row_dict.get("spec"):
            try:
                row_dict["spec"] = json.loads(row_dict["spec"])
            except Exception:
                pass
        parsed_slides.append(row_dict)

    presentation["slides"] = parsed_slides
    presentation["slide_count"] = len(parsed_slides)

    return presentation
