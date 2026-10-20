"""AI status and chat endpoints for FLUXA per Section 4.5 and 5.8."""

import json

from flask import Blueprint, Response, current_app, request

from app.ai import AIError, get_provider
from app.database import get_connection

ai_bp = Blueprint("ai", __name__)


@ai_bp.get("/status")
def ai_status_route():
    """Report the current AI configuration status and setup instructions."""
    provider = get_provider()
    configured = provider.is_configured

    if configured:
        msg = f"AI is ready using provider '{provider.name}'."
    else:
        if provider.name == "anthropic":
            msg = "AI isn't configured. Add ANTHROPIC_API_KEY in .env."
        elif provider.name == "openrouter":
            msg = "AI isn't configured. Add OPENROUTER_API_KEY in .env."
        else:
            msg = "AI is running in deterministic offline mode."

    return {
        "configured": configured,
        "provider": provider.name,
        "message": msg,
    }, 200


@ai_bp.get("/<int:presentation_id>/ai/messages")
def get_ai_messages_route(presentation_id: int):
    """Fetch persisted chat history for a presentation."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        rows = conn.execute(
            """
            SELECT id, presentation_id, role, content, ops, created_at
            FROM ai_messages
            WHERE presentation_id = ?
            ORDER BY id ASC
            """,
            (presentation_id,),
        ).fetchall()
        messages = []
        for r in rows:
            d = dict(r)
            if d.get("ops"):
                try:
                    d["ops"] = json.loads(d["ops"])
                except Exception:
                    pass
            messages.append(d)
        return {"messages": messages}, 200
    finally:
        conn.close()


@ai_bp.delete("/<int:presentation_id>/ai/messages")
def clear_ai_messages_route(presentation_id: int):
    """Clear chat history for a presentation."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        conn.execute("DELETE FROM ai_messages WHERE presentation_id = ?", (presentation_id,))
        conn.commit()
        return {"message": "Chat history cleared."}, 200
    finally:
        conn.close()


@ai_bp.post("/<int:presentation_id>/ai/chat")
def ai_chat_route(presentation_id: int):
    """Execute AI chat instruction, return ops, and stream response if requested."""
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return {"error": "The 'message' field is required."}, 400

    current_slide_id = data.get("current_slide_id")
    client_current_slide = data.get("current_slide")
    stream_requested = (
        data.get("stream", False) or request.headers.get("Accept") == "text/event-stream"
    )

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        # Load presentation metadata
        pres = conn.execute(
            "SELECT id, title, description, datasets, variables FROM presentations WHERE id = ?",
            (presentation_id,),
        ).fetchone()
        if not pres:
            return {"error": "Presentation not found."}, 404

        # Load current slide
        active_slide = client_current_slide or {}
        if not active_slide and current_slide_id:
            slide_row = conn.execute(
                "SELECT id, title, spec FROM slides WHERE id = ? AND presentation_id = ?",
                (current_slide_id, presentation_id),
            ).fetchone()
            if slide_row and slide_row["spec"]:
                try:
                    active_slide = json.loads(slide_row["spec"])
                except Exception:
                    active_slide = {"title": slide_row["title"], "blocks": []}

        # Load recent chat history (last 10 turns)
        history_rows = conn.execute(
            """
            SELECT role, content FROM ai_messages
            WHERE presentation_id = ?
            ORDER BY id DESC LIMIT 10
            """,
            (presentation_id,),
        ).fetchall()
        history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_rows)]

        deck_context = {
            "title": pres["title"],
            "description": pres["description"],
            "datasets": json.loads(pres["datasets"]) if pres["datasets"] else {},
            "variables": json.loads(pres["variables"]) if pres["variables"] else {},
        }

        # Save user message
        cursor = conn.execute(
            "INSERT INTO ai_messages (presentation_id, role, content) VALUES (?, 'user', ?)",
            (presentation_id, message),
        )
        conn.commit()

        provider = get_provider()
        if not provider.is_configured:
            return {
                "error": f"AI isn't configured. Add {provider.name.upper()}_API_KEY in .env.",
                "code": "not_configured",
            }, 503

        try:
            assistant_text, ops = provider.chat_ops(message, active_slide, deck_context, history)
        except AIError as err:
            return {"error": str(err), "code": err.code}, 502
        except Exception as err:
            return {"error": f"AI request failed: {err}", "code": "provider_error"}, 502

        # Save assistant message with ops
        cursor = conn.execute(
            "INSERT INTO ai_messages (presentation_id, role, content, ops) VALUES (?, 'assistant', ?, ?)",
            (presentation_id, assistant_text, json.dumps(ops)),
        )
        msg_id = cursor.lastrowid
        conn.commit()

    finally:
        conn.close()

    if stream_requested:

        def stream_chat():
            # Emit text delta
            yield f"event: text\ndata: {json.dumps({'delta': assistant_text})}\n\n"
            # Emit ops
            yield f"event: ops\ndata: {json.dumps({'ops': ops, 'message': assistant_text})}\n\n"
            # Emit done
            yield f"event: done\ndata: {json.dumps({'message_id': msg_id})}\n\n"

        return Response(stream_chat(), mimetype="text/event-stream")

    return {
        "message": assistant_text,
        "ops": ops,
        "message_id": msg_id,
    }, 200
