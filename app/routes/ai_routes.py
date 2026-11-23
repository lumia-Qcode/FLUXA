"""AI status and chat endpoints for FLUXA per Section 4.5 and 5.8."""

import json
import logging
import time
from datetime import datetime

from flask import Blueprint, Response, current_app, request

from app.ai import AIError, gateway, get_provider
from app.ai.bilingual import detect_language
from app.ai.copilot_ops import looks_like_edit, normalize_ops, resolve_images, simulate
from app.database import get_connection

ai_bp = Blueprint("ai", __name__)


@ai_bp.get("/models3d/search")
def models3d_search():
    """Search Sketchfab's public 3D library (used by the editor's 3D picker)."""
    from flask import request as _req

    from app.ai.model_library import search_models

    q = (_req.args.get("q") or "").strip()
    if not q:
        return {"error": "Type what the 3D model should show.", "code": "query_required"}, 400
    return {"query": q, "models": search_models(q, count=12)}
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Diff helpers
# ---------------------------------------------------------------------------

def _deck_outline(conn, presentation_id: int, limit: int = 30) -> list:
    """Every slide's id, position and its title/text blocks, so Copilot can edit other slides."""
    from app.ai.openrouter_provider import summarize_block

    out = []
    rows = conn.execute(
        "SELECT id, slide_order, title, spec FROM slides WHERE presentation_id = ? ORDER BY slide_order, id LIMIT ?",
        (presentation_id, limit),
    ).fetchall()
    for i, r in enumerate(rows, start=1):
        try:
            spec = json.loads(r["spec"]) if r["spec"] else {}
        except (TypeError, ValueError):
            spec = {}
        texts = []
        for b in spec.get("blocks") or []:
            if isinstance(b, dict) and b.get("type") == "text":
                s = summarize_block(b, {})
                if s.get("text"):
                    texts.append({"id": s["id"], "role": s.get("role"), "text": s["text"][:140]})
        # The editor names slides "slide-<db id>"; the spec's own id is not known to it.
        out.append({"number": i, "slide_id": f"slide-{r['id']}", "title": r["title"] or "", "text_blocks": texts[:4]})
    return out


def _editor_slides(conn, presentation_id: int, active: dict) -> list:
    """All slides with editor ids; the client's copy of the open slide replaces the stored one."""
    slides = []
    for r in conn.execute(
        "SELECT id, title, spec FROM slides WHERE presentation_id = ? ORDER BY slide_order, id", (presentation_id,)
    ).fetchall():
        try:
            spec = json.loads(r["spec"]) if r["spec"] else {}
        except (TypeError, ValueError):
            spec = {}
        sid = f"slide-{r['id']}"
        if isinstance(active, dict) and active.get("id") == sid:
            slides.append(active)
        else:
            slides.append({"id": sid, "title": r["title"], "layout": spec.get("layout"), "notes": spec.get("notes", ""), "blocks": spec.get("blocks") or []})
    if isinstance(active, dict) and active.get("id") and not any(sl.get("id") == active.get("id") for sl in slides):
        slides.append(active)
    return slides


def _snapshot_slide(slide: dict) -> dict:
    """Return a serialisable snapshot of the slide's block states."""
    if not slide:
        return {}
    return {
        "blocks": [
            {
                "id": b.get("id"),
                "type": b.get("type"),
                "props": dict(b.get("props") or {}),
            }
            for b in (slide.get("blocks") or [])
            if isinstance(b, dict)
        ]
    }


def _compute_diff(before: dict, after: dict) -> dict:
    """Lightweight before/after diff of a slide's blocks."""
    before_map = {b["id"]: b for b in before.get("blocks", []) if b.get("id")}
    after_map = {b["id"]: b for b in after.get("blocks", []) if b.get("id")}

    added = [bid for bid in after_map if bid not in before_map]
    removed = [bid for bid in before_map if bid not in after_map]
    changed = [
        bid for bid in before_map
        if bid in after_map and before_map[bid] != after_map[bid]
    ]
    empty = not (added or removed or changed)
    return {"empty": empty, "added": added, "changed": changed, "removed": removed}


def _apply_ops_snapshot(snapshot: dict, ops: list) -> dict:
    """Simulate applying ops to a snapshot copy and return updated snapshot for diff."""
    import copy
    result = copy.deepcopy(snapshot)
    blocks = result.get("blocks", [])
    block_map = {b["id"]: b for b in blocks if b.get("id")}

    for op in (ops or []):
        op_type = op.get("op", "")
        if op_type in ("set_block_props", "update_chart", "restyle"):
            bid = op.get("block_id") or op.get("id")
            if bid and bid in block_map:
                block_map[bid]["props"].update(op.get("props") or {})
        elif op_type == "add_block":
            blk = op.get("block") or {}
            bid = blk.get("id") or f"new-{len(blocks)}"
            blocks.append({"id": bid, "type": blk.get("type", "text"), "props": dict(blk.get("props") or {})})
        elif op_type == "remove_block":
            bid = op.get("block_id")
            if bid:
                blocks[:] = [b for b in blocks if b.get("id") != bid]

    result["blocks"] = blocks
    return result


def _selection_note(slide: dict, selected: list, scope: str) -> str:
    blocks = {b.get("id"): b for b in (slide or {}).get("blocks") or [] if isinstance(b, dict)}
    picked = [blocks[i] for i in selected if i in blocks]
    if scope == "deck":
        return "SCOPE: the whole deck. Apply the request to every slide it concerns, using block ids from the Deck Outline."
    if picked and scope == "selection":
        names = ", ".join(f"{b.get('id')} ({b.get('type')}/{b.get('role') or '-'})" for b in picked)
        return f"SCOPE: the selected block(s) {names}. 'This', 'it' and 'the selection' mean these blocks."
    if picked:
        names = ", ".join(f"{b.get('id')} ({b.get('type')}/{b.get('role') or '-'})" for b in picked)
        return f"SCOPE: the current slide. Selected on the canvas: {names} ('this' or 'it' means the selection)."
    return "SCOPE: the current slide."


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

    # Free daily quotas that are used up, and when they reset (UTC epoch seconds).
    exhausted = {}
    if provider.name == "openrouter":
        from app.ai.openrouter_provider import _EXHAUSTED_UNTIL

        now = time.time()
        exhausted = {k: int(v) for k, v in _EXHAUSTED_UNTIL.items() if v > now}
        if configured and exhausted and len(exhausted) >= len({provider._quota_key(r) for r in provider.routes}):
            msg = "The free AI daily limit is used up. AI features use templates until it resets."

    return {
        "configured": configured,
        "provider": provider.name,
        "message": msg,
        "quota_exhausted_until": exhausted,
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
@gateway.feature("copilot.chat")
def ai_chat_route(presentation_id: int):
    """Execute AI chat instruction, return ops, and stream response if requested."""
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return {"error": "The 'message' field is required."}, 400
    # #11 Co-Author roles: researcher | designer | storyteller | critic | coach (optional)
    co_role = str(data.get("role") or "").lower()
    co_role = co_role if co_role in ("researcher", "designer", "storyteller", "critic", "coach") else ""

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
            "slides": _deck_outline(conn, presentation_id),
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

        # --- Bilingual detection ---
        detected_lang = detect_language(message)

        # --- Before-state snapshot for diff verification ---
        before_snapshot = _snapshot_slide(active_slide)

        assistant_text = ""
        ops = []
        diff = {"empty": True, "added": [], "changed": [], "removed": []}
        success = False

        selected_ids = [x for x in (data.get("selected_block_ids") or []) if isinstance(x, str)]
        scope = str(data.get("scope") or "slide")
        deck_slides = _editor_slides(conn, presentation_id, active_slide)
        selection_note = _selection_note(active_slide, selected_ids, scope)
        wants_edit = looks_like_edit(message)
        problems: list = []
        original_message = message

        def ask(msg, hist):
            try:
                return provider.chat_ops(
                    msg, active_slide, deck_context, hist, language=detected_lang, selection=selection_note,
                    **({"role": co_role} if co_role else {}),
                )
            except TypeError:
                # Providers without the selection/language keywords
                return provider.chat_ops(msg, active_slide, deck_context, hist)

        try:
            # One retry, with specific feedback, when an edit request produced nothing that applies.
            for attempt in range(2):
                assistant_text, raw_ops = ask(message, history)
                ops, problems = normalize_ops(raw_ops, deck_slides, active_slide, selected_ids)
                problems += resolve_images(ops, pres["description"] or pres["title"] or "")
                changes = simulate(deck_slides, ops, active_slide.get("id"))
                success = changes or (not wants_edit and not ops)
                if success or attempt == 1:
                    break
                valid = ", ".join(f"{b.get('id')} ({b.get('type')}/{b.get('role') or '-'})" for b in active_slide.get("blocks") or [] if isinstance(b, dict))
                feedback = (
                    "Your previous answer did not change the slide"
                    + (": " + "; ".join(problems[:5]) if problems else " (no operations, or operations that change nothing)")
                    + f". Valid block ids on the current slide: {valid or 'none'}. Return ops that make every requested change."
                )
                logger.info("[COPILOT_AUDIT] pid=%s retrying: %s", presentation_id, feedback[:300])
                history = history + [{"role": "user", "content": original_message}, {"role": "assistant", "content": assistant_text}]
                message = f"{original_message}\n\n[System feedback: {feedback}]"

            after = _apply_ops_snapshot(_snapshot_slide(active_slide), ops)
            diff = _compute_diff(before_snapshot, after)
            if problems and wants_edit:
                assistant_text = (assistant_text or "").rstrip() + "\n\nNot done: " + "; ".join(dict.fromkeys(problems))[:500] + "."
            if wants_edit and not success:
                assistant_text = (assistant_text or "").rstrip() + "\n\nI couldn't turn this request into a change on the slide. Try naming the element (title, bullets, chart, image) you want changed."
            logger.info(
                "[COPILOT_AUDIT] ts=%s pid=%s lang=%s ops=%d changes=%s problems=%s",
                datetime.utcnow().isoformat(), presentation_id, detected_lang, len(ops), success, problems[:5],
            )

        except AIError as err:
            return {"error": f"{err} Nothing was changed.", "code": err.code}, 502
        except Exception as err:
            return {"error": f"AI request failed: {err}. Nothing was changed.", "code": "provider_error"}, 502

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
            # Emit ops with diff
            yield f"event: ops\ndata: {json.dumps({'ops': ops, 'message': assistant_text, 'diff': diff, 'lang': detected_lang})}\n\n"
            # Emit done
            yield f"event: done\ndata: {json.dumps({'message_id': msg_id})}\n\n"

        return Response(stream_chat(), mimetype="text/event-stream")

    return {
        "message": assistant_text,
        "ops": ops,
        "message_id": msg_id,
        "diff": diff,
        "lang": detected_lang,
    }, 200
