"""FT-12 - API routes for AI presentation generation (T24-T27) and streaming pipeline."""

import json
import logging

from flask import Blueprint, Response, current_app, request

from app.ai import AIError, compile_semantic_slide, gateway, get_provider
from app.ai.deck_writer import GenerationUnavailable
from app.ai.typography import with_pairing
from app.auth import current_owner
from app.config import Config
from app.services.deck_generation import (
    build_deck,
    research_and_outline,
    run_with_events,
    slide_events,
)
from app.services.generation_service import save_generated_presentation
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

    brand_id = data.get("brand_id")
    if brand_id is not None and (not isinstance(brand_id, int) or isinstance(brand_id, bool)):
        return None, ({"error": "'brand_id' must be a number."}, 400)

    return {
        "brand_id": brand_id,
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
@gateway.feature("outline.generate")
def generate_outline_route():
    """T24 + T25: send prompt to AI and return outline with slide intents."""
    values, error = read_request()
    if error:
        return error

    provider = get_provider()
    if provider.is_configured and provider.name != "mock":
        try:
            # Same request from the same organisation within 24 h: reuse the researched outline
            # (saves the free daily quota). Outlines that fell back are never cached.
            outline = gateway.cached(
                "outline.generate",
                {k: values[k] for k in ("topic", "slide_count", "audience", "language")},
                lambda: research_and_outline(provider, values),
            )
            return {"outline": outline}, 200
        except GenerationUnavailable as exc:
            return {"error": str(exc), "code": "unavailable"}, 503
        except AIError as exc:
            return {"error": str(exc), "code": exc.code}, 503 if exc.code == "not_configured" else 502

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
        owner = current_owner()  # captured now: the streamed generator runs outside the request

        def sse(event: str, data) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        def stream_generation():
            try:
                if provider.name == "mock":
                    yield from _mock_stream(provider, values, db_path, owner, sse)
                    return
                yield sse("research_start", {"status": "Planning research and searching sources", "topic": values["topic"]})
                user_outline = values.get("outline")
                result = None
                for kind, payload in run_with_events(lambda progress: build_deck(provider, values, user_outline, progress)):
                    if kind == "progress":
                        message, extra = payload
                        yield sse("text", {"delta": f"[PROGRESS: {message}]", "detail": extra})
                    else:
                        result = payload
                dossier = result["dossier"]
                yield sse("research_complete", {
                    "status": _research_status(dossier),
                    "citations": dossier.get("citations", []),
                    "summary": "",
                    "research_mode": dossier.get("research_mode"),
                    "trace": {k: v for k, v in (dossier.get("research_trace") or {}).items() if k != "queries"},
                    "limitations": dossier.get("limitations", []),
                })
                yield sse("outline", {k: v for k, v in result["outline"].items() if k != "research_dossier"})
                total = len(result["slides"])
                for ev in slide_events(result["slides"], result["datasets"]):
                    yield sse("slide", ev)
                    yield sse("progress", {"current": ev["index"] + 1, "total": total})
                presentation = _save(db_path, values, result["outline"], result["slides"], result["datasets"], dossier, owner)
                yield sse("done", {"presentation": presentation, "report": _public_report(result["report"])})
            except GenerationUnavailable as e:
                yield sse("error", {"error": str(e), "code": "unavailable"})
            except AIError as e:
                yield sse("error", {"error": str(e), "code": e.code})
            except Exception as e:
                logging.getLogger(__name__).exception("deck generation failed")
                yield sse("error", {"error": f"Generation failed: {e}"})

        def stream_with_gateway():
            with gateway.session("deck.generate", owner["org_id"], owner["owner_id"], db_path):
                yield from gateway.with_status_on_done(stream_generation())

        return Response(stream_with_gateway(), mimetype="text/event-stream")

    # Non-stream Generation Route (used by WorkspacePage and direct API)
    with gateway.request_session("deck.generate"):
        body, code = _generate_presentation_json(values)
        body["ai"] = gateway.status()
        return body, code


def _generate_presentation_json(values):
    provider = get_provider()
    if provider.name == "mock":
        return _mock_json(provider, values)
    try:
        result = build_deck(provider, values, values.get("outline"))
    except GenerationUnavailable as exc:
        return {"error": str(exc), "code": "unavailable"}, 503
    except AIError as exc:
        return {"error": str(exc), "code": exc.code}, 503 if exc.code == "not_configured" else 502
    presentation = _save(current_app.config["DATABASE_PATH"], values, result["outline"], result["slides"],
                         result["datasets"], result["dossier"], current_owner())
    return {"message": "Presentation generated successfully", "presentation": presentation,
            "report": _public_report(result["report"])}, 201


def _theme(values):
    theme = {"themeId": values["theme"]} if isinstance(values.get("theme"), str) else values.get("theme") or {"themeId": "midnight"}
    return with_pairing(theme, values["topic"])


def _apply_brand(db_path, presentation, brand_id, org_id):
    """Pin the new deck to the chosen brand's active version (ignored if it isn't this org's)."""
    if not brand_id or org_id is None or not presentation:
        return presentation
    from app.brand.store import deck_brand
    from app.database import get_connection

    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT active_version_id FROM brands WHERE id = ? AND org_id = ? AND status != 'archived'", (brand_id, org_id)
        ).fetchone()
        if not row or not row["active_version_id"]:
            return presentation
        conn.execute(
            "UPDATE presentations SET brand_id = ?, brand_version_id = ? WHERE id = ?",
            (brand_id, row["active_version_id"], presentation["id"]),
        )
        conn.commit()
        presentation["brand"] = deck_brand(conn, org_id, brand_id, row["active_version_id"])
        return presentation
    finally:
        conn.close()


def _save(db_path, values, outline, slides, datasets, dossier, owner):
    presentation = _save_deck(db_path, values, outline, slides, datasets, dossier, owner)
    return _apply_brand(db_path, presentation, values.get("brand_id"), owner.get("org_id"))


def _save_deck(db_path, values, outline, slides, datasets, dossier, owner):
    return save_generated_presentation(
        db_path,
        title=values["title"] or outline.get("title", values["topic"]),
        description=values["topic"],
        slides=slides,
        theme=_theme(values),
        datasets=datasets,
        variables={"research_dossier": dossier} if dossier else None,
        **owner,
    )


def _research_status(dossier):
    trace = dossier.get("research_trace") or {}
    if not dossier.get("sources"):
        return "No sources could be retrieved; the slides contain no citations or figures."
    return (
        f"Research complete: {trace.get('sources_kept', 0)} sources kept from {trace.get('documents_retrieved', 0)} "
        f"documents across {trace.get('successful_queries', 0)} of {trace.get('query_count', 0)} searches"
    )


def _public_report(report):
    return {
        "removed_claims": len(report.get("removed_claims") or []),
        "dropped_visuals": len(report.get("dropped_visuals") or []),
        "repaired_slides": [r.get("index") for r in report.get("repaired_slides") or []],
        "extractive_slides": report.get("extractive_slides") or [],
        "images": report.get("images") or {},
        "model_errors": len(report.get("model_errors") or []),
    }


def _mock_slides(provider, values, outline_data):
    """Offline demo and tests: the mock provider's canned content, compiled as before."""
    slides_list = outline_data.get("slides", [])
    compiled, datasets = [], {}
    used_3d: set = set()
    last_3d = [0]
    for idx, item in enumerate(slides_list, start=1):
        item = {**item, "_index": idx} if isinstance(item, dict) else item
        semantic = provider.generate_slide(item, {"title": values["title"] or outline_data.get("title", ""), "description": values["topic"]})
        spec, ds = compile_semantic_slide(semantic, idx, used_3d_models=used_3d, total_slides=len(slides_list), last_3d_slide=last_3d)
        datasets.update(ds or {})
        bullets = semantic.get("bullets") or [item.get("title", "")]
        compiled.append({"slide_order": idx, "title": item.get("title", f"Slide {idx}"),
                         "content": "- " + "\n- ".join(bullets), "spec": spec})
    return compiled, datasets


def _mock_outline(provider, values):
    outline = values.get("outline")
    if not outline or "slides" not in outline:
        outline = provider.generate_outline(values["topic"], values["slide_count"], values["audience"], values["language"])
    return outline


def _mock_stream(provider, values, db_path, owner, sse):
    yield sse("research_start", {"status": "Offline demo mode: no research is performed", "topic": values["topic"]})
    outline = _mock_outline(provider, values)
    yield sse("research_complete", {"status": "Offline demo mode: content is sample data", "citations": [], "summary": "", "research_mode": "mock"})
    yield sse("outline", outline)
    compiled, datasets = _mock_slides(provider, values, outline)
    for ev in slide_events(compiled, datasets):
        yield sse("slide", ev)
        yield sse("progress", {"current": ev["index"] + 1, "total": len(compiled)})
    presentation = _save(db_path, values, outline, compiled, datasets, outline.get("research_dossier") or {}, owner)
    yield sse("done", {"presentation": presentation})


def _mock_json(provider, values):
    outline = _mock_outline(provider, values)
    compiled, datasets = _mock_slides(provider, values, outline)
    presentation = _save(current_app.config["DATABASE_PATH"], values, outline, compiled, datasets,
                         outline.get("research_dossier") or {}, current_owner())
    return {"message": "Presentation generated successfully", "presentation": presentation}, 201


@generation_bp.post("/<int:presentation_id>/copilot")
@gateway.feature("copilot.chat")
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
@gateway.feature("slide.enhance")
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
