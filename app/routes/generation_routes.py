"""FT-12 - API routes for AI presentation generation (T24-T27) and streaming pipeline."""

import json
import time

from flask import Blueprint, Response, current_app, request

from app.ai import AIError, compile_semantic_slide, get_provider
from app.config import Config
from app.services.generation_service import (
    generate_structured_slides,
    save_generated_presentation,
)
from app.services.outline_service import generate_outline
from app.services.slide_parser import AIResponseError

generation_bp = Blueprint("generation", __name__)


def read_request():
    """Validate the shared request body. Returns (values, error_response)."""
    data = request.get_json(silent=True)

    if not data or not isinstance(data, dict):
        return None, ({"error": "Request body must contain JSON data."}, 400)

    topic = data.get("topic")

    if not isinstance(topic, str) or not topic.strip():
        return None, ({"error": "The 'topic' field is required."}, 400)

    slide_count = data.get("slide_count", 8)

    if (
        not isinstance(slide_count, int)
        or isinstance(slide_count, bool)
        or not 1 <= slide_count <= 30
    ):
        return None, ({"error": "The 'slide_count' field must be between 1 and 30."}, 400)

    audience = data.get("audience") or "General audience"
    language = data.get("language") or "English"
    title = data.get("title", "")
    theme = data.get("theme")
    outline = data.get("outline")
    stream = data.get("stream", False)

    if not all(isinstance(v, str) for v in (audience, language, title)):
        return None, ({"error": "'audience', 'language' and 'title' must be strings."}, 400)

    return {
        "topic": topic.strip(),
        "slide_count": slide_count,
        "audience": audience.strip(),
        "language": language.strip(),
        "title": title.strip(),
        "theme": theme,
        "outline": outline,
        "stream": stream,
    }, None


def run_ai(action):
    """Run an AI action and translate failures into API errors."""
    if not Config.OPENROUTER_API_KEY:
        return None, ({"error": "AI service is not configured."}, 503)

    try:
        return action(), None
    except AIResponseError as error:
        return None, ({"error": str(error)}, 502)
    except AIError as error:
        status = 503 if error.code == "not_configured" else 502
        return None, ({"error": str(error), "code": error.code}, status)
    except ValueError as error:
        return None, ({"error": str(error)}, 400)
    except RuntimeError as error:
        return None, ({"error": f"AI request failed: {error}"}, 502)


@generation_bp.post("/generate/outline")
def generate_outline_route():
    """T24 + T25: send prompt to AI and return outline with slide intents."""
    values, error = read_request()
    if error:
        return error

    provider = get_provider()
    if provider.is_configured:
        try:
            outline = provider.generate_outline(
                values["topic"],
                values["slide_count"],
                values["audience"],
                values["language"],
            )
            return {"outline": outline}, 200
        except Exception as e:
            return {"error": str(e)}, 502

    outline, error = run_ai(
        lambda: generate_outline(
            values["topic"],
            values["slide_count"],
            values["audience"],
            values["language"],
        )
    )
    if error:
        return error

    return {"outline": outline}, 200


@generation_bp.post("/generate")
def generate_presentation_route():
    """T24-T27: generate full presentation (supports SSE streaming and JSON)."""
    values, error = read_request()
    if error:
        return error

    is_stream = values["stream"] or request.headers.get("Accept") == "text/event-stream"

    if is_stream:
        provider = get_provider()
        if not provider.is_configured and not Config.OPENROUTER_API_KEY:
            return {"error": "AI service is not configured.", "code": "not_configured"}, 503

        db_path = current_app.config["DATABASE_PATH"]

        def stream_generation():
            try:
                # 1. Resolve Outline
                outline_data = values.get("outline")
                if not outline_data or "slides" not in outline_data:
                    outline_data = provider.generate_outline(
                        values["topic"],
                        values["slide_count"],
                        values["audience"],
                        values["language"],
                    )
                yield f"event: outline\ndata: {json.dumps(outline_data)}\n\n"

                slides_list = outline_data.get("slides", [])
                total = len(slides_list)
                compiled_slides = []
                all_datasets = {}

                # 2. Generate and compile each slide
                for idx, item in enumerate(slides_list, start=1):
                    semantic = provider.generate_slide(
                        item,
                        {
                            "title": values["title"] or outline_data.get("title", ""),
                            "description": values["topic"],
                        },
                    )
                    slide_spec, ds = compile_semantic_slide(semantic, idx)
                    if ds:
                        all_datasets.update(ds)

                    slide_record = {
                        "slide_order": idx,
                        "title": item.get("title", f"Slide {idx}"),
                        "content": "- " + "\n- ".join(semantic.get("bullets", ["Point 1"])),
                        "spec": slide_spec,
                    }
                    compiled_slides.append(slide_record)

                    # Emit slide arrived event
                    yield f"event: slide\ndata: {json.dumps({'index': idx - 1, 'slide': slide_record, 'datasets': ds})}\n\n"
                    # Emit progress event
                    yield f"event: progress\ndata: {json.dumps({'current': idx, 'total': total})}\n\n"
                    time.sleep(0.15)

                # 3. Save to database
                theme_dict = None
                if values.get("theme"):
                    theme_dict = (
                        {"themeId": values["theme"]}
                        if isinstance(values["theme"], str)
                        else values["theme"]
                    )

                presentation = save_generated_presentation(
                    db_path,
                    title=values["title"] or outline_data.get("title", values["topic"]),
                    description=values["topic"],
                    slides=compiled_slides,
                    theme=theme_dict,
                    datasets=all_datasets,
                )

                yield f"event: done\ndata: {json.dumps({'presentation': presentation})}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        return Response(stream_generation(), mimetype="text/event-stream")

    # If outline was explicitly provided from Step 2 of modern Create flow:
    if values.get("outline"):
        provider = get_provider()
        outline_data = values["outline"]
        compiled_slides = []
        all_datasets = {}
        for idx, item in enumerate(outline_data.get("slides", []), start=1):
            semantic = provider.generate_slide(
                item,
                {
                    "title": values["title"] or outline_data.get("title", ""),
                    "description": values["topic"],
                },
            )
            slide_spec, ds = compile_semantic_slide(semantic, idx)
            if ds:
                all_datasets.update(ds)
            compiled_slides.append(
                {
                    "slide_order": idx,
                    "title": item.get("title", f"Slide {idx}"),
                    "content": "- " + "\n- ".join(semantic.get("bullets", ["Point 1"])),
                    "spec": slide_spec,
                }
            )
        presentation = save_generated_presentation(
            current_app.config["DATABASE_PATH"],
            title=values["title"] or outline_data.get("title", values["topic"]),
            description=values["topic"],
            slides=compiled_slides,
            theme={"themeId": values["theme"]}
            if isinstance(values.get("theme"), str)
            else values.get("theme"),
            datasets=all_datasets,
        )
        return {
            "message": "Presentation generated successfully",
            "presentation": presentation,
        }, 201

    # Standard / legacy generation pipeline
    generated, error = run_ai(
        lambda: generate_structured_slides(
            values["topic"],
            values["slide_count"],
            values["audience"],
            values["language"],
        )
    )
    if error:
        return error

    presentation = save_generated_presentation(
        current_app.config["DATABASE_PATH"],
        title=values["title"] or generated["title"],
        description=values["topic"],
        slides=generated["slides"],
    )

    return {
        "message": "Presentation generated successfully",
        "presentation": presentation,
    }, 201


@generation_bp.post("/<int:presentation_id>/copilot")
def copilot_route(presentation_id):
    """Conversational AI Copilot to edit, add, delete, or discuss slides."""
    data = request.get_json(silent=True) or {}
    message = data.get("message", "").strip()
    if not message:
        return {"error": "Message is required."}, 400

    current_slide_id = data.get("current_slide_id")

    from app.services.copilot_service import execute_copilot_command

    res, error = run_ai(
        lambda: execute_copilot_command(
            current_app.config["DATABASE_PATH"],
            presentation_id,
            message,
            current_slide_id,
        )
    )
    if error:
        return error

    return res, 200


@generation_bp.post("/<int:presentation_id>/slides/<int:slide_id>/ai-enhance")
def ai_enhance_route(presentation_id, slide_id):
    """Enrich a slide's key points, metrics, and visual components using AI."""
    data = request.get_json(silent=True) or {}
    instruction = data.get("instruction", "").strip()

    from app.services.copilot_service import ai_enhance_slide

    slide, error = run_ai(
        lambda: ai_enhance_slide(
            current_app.config["DATABASE_PATH"],
            presentation_id,
            slide_id,
            instruction,
        )
    )
    if error:
        return error

    return {"message": "Slide enhanced successfully", "slide": slide}, 200


@generation_bp.post("/<int:presentation_id>/slides/<int:slide_id>/duplicate")
def duplicate_slide_route(presentation_id, slide_id):
    """Duplicate an existing slide and insert it right after the source slide."""
    from app.database import get_connection

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        source = conn.execute(
            "SELECT id, slide_order, title, content, spec FROM slides WHERE id = ? AND presentation_id = ?",
            (slide_id, presentation_id),
        ).fetchone()

        if not source:
            return {"error": "Slide not found."}, 404

        new_order = source["slide_order"] + 1
        conn.execute(
            "UPDATE slides SET slide_order = slide_order + 1 WHERE presentation_id = ? AND slide_order >= ?",
            (presentation_id, new_order),
        )
        cursor = conn.execute(
            "INSERT INTO slides (presentation_id, slide_order, title, content, spec) VALUES (?, ?, ?, ?, ?)",
            (
                presentation_id,
                new_order,
                f"{source['title']} (Copy)",
                source["content"],
                source["spec"],
            ),
        )
        new_id = cursor.lastrowid
        conn.commit()

        new_slide = conn.execute(
            "SELECT id, presentation_id, slide_order, title, content, spec, created_at, updated_at FROM slides WHERE id = ?",
            (new_id,),
        ).fetchone()
        row_dict = dict(new_slide)
        if row_dict.get("spec"):
            try:
                row_dict["spec"] = json.loads(row_dict["spec"])
            except Exception:
                pass
        return {"message": "Slide duplicated", "slide": row_dict}, 201
    finally:
        conn.close()


@generation_bp.post("/<int:presentation_id>/slides/reorder")
def reorder_slides_route(presentation_id):
    """Reorder slides by a list of slide IDs."""
    data = request.get_json(silent=True) or {}
    slide_ids = data.get("slide_ids", [])
    if not isinstance(slide_ids, list):
        return {"error": "slide_ids must be a list of integers."}, 400

    from app.database import get_connection

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        for idx, sid in enumerate(slide_ids, start=1):
            conn.execute(
                "UPDATE slides SET slide_order = ? WHERE id = ? AND presentation_id = ?",
                (idx, sid, presentation_id),
            )
        conn.commit()

        rows = conn.execute(
            "SELECT id, presentation_id, slide_order, title, content, spec, created_at, updated_at FROM slides WHERE presentation_id = ? ORDER BY slide_order ASC",
            (presentation_id,),
        ).fetchall()
        return {"message": "Slides reordered", "slides": [dict(r) for r in rows]}, 200
    finally:
        conn.close()
