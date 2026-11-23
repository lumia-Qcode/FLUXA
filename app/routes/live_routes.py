import json
import random
import socket
import string
import uuid
from datetime import datetime
from flask import Blueprint, current_app, g, jsonify, request

from app.database import get_connection
from app.privacy import store as privacy

live_bp = Blueprint("live", __name__)


def get_lan_ip():
    """Detect the host machine's Wi-Fi / Local Area Network IP for phone connections."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


@live_bp.get("/host-info")
def get_host_info():
    """Return local LAN IP so phones scanning QR code can connect over Wi-Fi."""
    ip = get_lan_ip()
    return jsonify({"local_ip": ip, "lan_ip": ip}), 200


def _generate_code(length=6):
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=length))


def _clean_inactive_participants(conn, session_id):
    """Mark or prune participants inactive after 60 seconds of silence."""
    try:
        conn.execute(
            """
            DELETE FROM live_participants
            WHERE session_id = ? AND role != 'moderator'
            AND last_ping < datetime('now', '-60 seconds')
            """,
            (session_id,),
        )
        conn.commit()
    except Exception:
        pass


@live_bp.post("/sessions")
def start_live_session():
    """Start or resume a live presentation meeting session."""
    data = request.get_json(silent=True) or {}
    presentation_id = data.get("presentation_id")
    host_name = (data.get("host_name") or "Presenter").strip()

    if not presentation_id:
        return jsonify({"error": "presentation_id is required"}), 400

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        # Check if presentation exists
        pres = conn.execute(
            "SELECT id, title, org_id FROM presentations WHERE id = ?", (presentation_id,)
        ).fetchone()
        if not pres or pres["org_id"] != g.org_id:
            return jsonify({"error": "Presentation not found"}), 404

        # Check if active session already exists for this presentation
        existing = conn.execute(
            """
            SELECT id, host_token, meeting_code, current_slide_index, status
            FROM live_sessions
            WHERE presentation_id = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (presentation_id,),
        ).fetchone()

        if existing:
            session_id = existing["id"]
            host_token = existing["host_token"]
            meeting_code = existing["meeting_code"]
            current_slide = existing["current_slide_index"]

            # Update host ping
            conn.execute(
                """
                UPDATE live_participants
                SET last_ping = CURRENT_TIMESTAMP
                WHERE session_id = ? AND role = 'moderator'
                """,
                (session_id,),
            )
            conn.commit()
            return jsonify({
                "session_id": session_id,
                "host_token": host_token,
                "meeting_code": meeting_code,
                "current_slide_index": current_slide,
                "presentation_id": presentation_id,
                "title": pres["title"],
                "status": "active",
                "resumed": True,
            }), 200

        # Create new session
        session_id = f"live_{uuid.uuid4().hex[:12]}"
        host_token = f"host_{uuid.uuid4().hex}"
        meeting_code = f"FLX-{_generate_code(4)}"
        participant_id = f"mod_{uuid.uuid4().hex[:8]}"

        conn.execute(
            """
            INSERT INTO live_sessions (id, presentation_id, host_token, meeting_code, current_slide_index, status)
            VALUES (?, ?, ?, ?, 0, 'active')
            """,
            (session_id, presentation_id, host_token, meeting_code),
        )

        conn.execute(
            """
            INSERT INTO live_participants (id, session_id, name, avatar_color, role)
            VALUES (?, ?, ?, ?, 'moderator')
            """,
            (participant_id, session_id, host_name, "#6366F1"),
        )

        conn.commit()
        return jsonify({
            "session_id": session_id,
            "host_token": host_token,
            "participant_id": participant_id,
            "meeting_code": meeting_code,
            "current_slide_index": 0,
            "presentation_id": presentation_id,
            "title": pres["title"],
            "status": "active",
            "resumed": False,
        }), 201
    finally:
        conn.close()


@live_bp.get("/sessions/<session_id>")
def get_session(session_id):
    """Get active session details, current slide, and participants count."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        _clean_inactive_participants(conn, session_id)
        row = conn.execute(
            """
            SELECT s.id, s.presentation_id, s.meeting_code, s.current_slide_index,
                   s.status, s.created_at, p.title as presentation_title
            FROM live_sessions s
            JOIN presentations p ON s.presentation_id = p.id
            WHERE s.id = ?
            """,
            (session_id,),
        ).fetchone()

        if not row:
            return jsonify({"error": "Live session not found"}), 404

        # Active participants count
        p_count_row = conn.execute(
            "SELECT COUNT(*) as count FROM live_participants WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        # Active poll
        active_poll = conn.execute(
            """
            SELECT id, slide_index, question, options, status, created_at
            FROM live_polls
            WHERE session_id = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()

        poll_data = None
        if active_poll:
            options = json.loads(active_poll["options"])
            # Vote breakdown
            votes = conn.execute(
                """
                SELECT option_index, COUNT(*) as vote_count
                FROM live_poll_votes
                WHERE poll_id = ?
                GROUP BY option_index
                """,
                (active_poll["id"],),
            ).fetchall()
            vote_map = {r["option_index"]: r["vote_count"] for r in votes}
            total_votes = sum(vote_map.values())
            breakdown = [
                {
                    "index": i,
                    "text": opt,
                    "votes": vote_map.get(i, 0),
                    "percentage": round((vote_map.get(i, 0) / total_votes * 100), 1) if total_votes > 0 else 0,
                }
                for i, opt in enumerate(options)
            ]
            poll_data = {
                "id": active_poll["id"],
                "slide_index": active_poll["slide_index"],
                "question": active_poll["question"],
                "options": breakdown,
                "total_votes": total_votes,
                "status": active_poll["status"],
            }

        return jsonify({
            "session_id": row["id"],
            "presentation_id": row["presentation_id"],
            "presentation_title": row["presentation_title"],
            "meeting_code": row["meeting_code"],
            "current_slide_index": row["current_slide_index"],
            "status": row["status"],
            "participants_count": p_count_row["count"] if p_count_row else 1,
            "active_poll": poll_data,
        }), 200
    finally:
        conn.close()


@live_bp.get("/by-code/<meeting_code>")
def get_session_by_code(meeting_code):
    """Find active session by 6-char code."""
    code = meeting_code.strip().upper()
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = conn.execute(
            """
            SELECT s.id, s.presentation_id, s.meeting_code, s.status, p.title
            FROM live_sessions s
            JOIN presentations p ON s.presentation_id = p.id
            WHERE UPPER(s.meeting_code) = ? AND s.status = 'active'
            LIMIT 1
            """,
            (code,),
        ).fetchone()

        if not row:
            return jsonify({"error": "No active meeting found with this code"}), 404

        return jsonify({
            "session_id": row["id"],
            "presentation_id": row["presentation_id"],
            "meeting_code": row["meeting_code"],
            "title": row["title"],
        }), 200
    finally:
        conn.close()


@live_bp.post("/sessions/<session_id>/join")
def join_session(session_id):
    """Join as viewer participant."""
    data = request.get_json(silent=True) or {}
    if data.get("accept_notice") is not True or data.get("notice_version") != privacy.AUDIENCE_NOTICE_VERSION:
        return jsonify({
            "error": "Please read and accept the privacy notice to join.",
            "code": "notice_required",
            "notice_version": privacy.AUDIENCE_NOTICE_VERSION,
        }), 400
    name = (data.get("name") or "").strip()[:60] or "Guest"
    avatar_color = data.get("avatar_color") or random.choice(
        ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4"]
    )

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        sess = conn.execute("SELECT id, status FROM live_sessions WHERE id = ?", (session_id,)).fetchone()
        if not sess:
            return jsonify({"error": "Meeting session not found"}), 404
        if sess["status"] != "active":
            return jsonify({"error": "This meeting has ended"}), 410

        participant_id = f"usr_{uuid.uuid4().hex[:10]}"
        conn.execute(
            """
            INSERT INTO live_participants (id, session_id, name, avatar_color, role)
            VALUES (?, ?, ?, ?, 'viewer')
            """,
            (participant_id, session_id, name, avatar_color),
        )
        org_id = privacy.session_org(conn, session_id)
        if org_id is not None:
            privacy.grant(conn, org_id, "participant", participant_id, privacy.AUDIENCE_PARTICIPATION,
                          session_id=session_id, notice_version=privacy.AUDIENCE_NOTICE_VERSION)
        conn.commit()

        return jsonify({
            "participant_id": participant_id,
            "session_id": session_id,
            "name": name,
            "avatar_color": avatar_color,
            "role": "viewer",
        }), 201
    finally:
        conn.close()


@live_bp.post("/sessions/<session_id>/ping")
def ping_session(session_id):
    """Participant/host heartbeat and lightweight state pull."""
    data = request.get_json(silent=True) or {}
    participant_id = data.get("participant_id")

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        if participant_id:
            conn.execute(
                "UPDATE live_participants SET last_ping = CURRENT_TIMESTAMP WHERE id = ?",
                (participant_id,),
            )
            conn.commit()

        sess = conn.execute(
            "SELECT current_slide_index, status FROM live_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

        if not sess:
            return jsonify({"error": "Session not found"}), 404

        # Active participants count
        p_count = conn.execute(
            """
            SELECT COUNT(*) as count FROM live_participants
            WHERE session_id = ? AND last_ping >= datetime('now', '-60 seconds')
            """,
            (session_id,),
        ).fetchone()["count"]

        # Active poll check
        active_poll = conn.execute(
            """
            SELECT id, slide_index, question, options, status
            FROM live_polls
            WHERE session_id = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()

        poll_summary = None
        has_voted = False
        voted_option = None

        if active_poll:
            options = json.loads(active_poll["options"])
            votes = conn.execute(
                """
                SELECT option_index, COUNT(*) as vote_count
                FROM live_poll_votes
                WHERE poll_id = ?
                GROUP BY option_index
                """,
                (active_poll["id"],),
            ).fetchall()
            vote_map = {r["option_index"]: r["vote_count"] for r in votes}
            total_votes = sum(vote_map.values())

            if participant_id:
                user_vote = conn.execute(
                    "SELECT option_index FROM live_poll_votes WHERE poll_id = ? AND participant_id = ?",
                    (active_poll["id"], participant_id),
                ).fetchone()
                if user_vote:
                    has_voted = True
                    voted_option = user_vote["option_index"]

            poll_summary = {
                "id": active_poll["id"],
                "slide_index": active_poll["slide_index"],
                "question": active_poll["question"],
                "options": [
                    {
                        "index": i,
                        "text": opt,
                        "votes": vote_map.get(i, 0),
                        "percentage": round((vote_map.get(i, 0) / total_votes * 100), 1) if total_votes > 0 else 0,
                    }
                    for i, opt in enumerate(options)
                ],
                "total_votes": total_votes,
                "has_voted": has_voted,
                "voted_option": voted_option,
                "status": active_poll["status"],
            }

        return jsonify({
            "current_slide_index": sess["current_slide_index"],
            "status": sess["status"],
            "participants_count": p_count,
            "active_poll": poll_summary,
        }), 200
    finally:
        conn.close()


@live_bp.post("/sessions/<session_id>/sync")
def sync_slide(session_id):
    """Host updates active slide index."""
    data = request.get_json(silent=True) or {}
    slide_index = data.get("current_slide_index")
    host_token = data.get("host_token")

    if slide_index is None:
        return jsonify({"error": "current_slide_index is required"}), 400

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        sess = conn.execute(
            "SELECT host_token FROM live_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not sess:
            return jsonify({"error": "Session not found"}), 404

        # Validate host token if provided
        if host_token and sess["host_token"] != host_token:
            return jsonify({"error": "Unauthorized host action"}), 403

        conn.execute(
            "UPDATE live_sessions SET current_slide_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (int(slide_index), session_id),
        )
        conn.commit()

        return jsonify({"success": True, "current_slide_index": int(slide_index)}), 200
    finally:
        conn.close()


@live_bp.post("/sessions/<session_id>/end")
def end_session(session_id):
    """Host ends live meeting."""
    data = request.get_json(silent=True) or {}
    host_token = data.get("host_token")

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        sess = conn.execute(
            "SELECT host_token FROM live_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not sess:
            return jsonify({"error": "Session not found"}), 404
        if host_token and sess["host_token"] != host_token:
            return jsonify({"error": "Unauthorized"}), 403

        conn.execute(
            "UPDATE live_sessions SET status = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session_id,),
        )
        conn.commit()
        return jsonify({"success": True, "status": "ended"}), 200
    finally:
        conn.close()


@live_bp.get("/sessions/<session_id>/participants")
def list_participants(session_id):
    """Get active attendees list."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        rows = conn.execute(
            """
            SELECT id, name, avatar_color, role, last_ping
            FROM live_participants
            WHERE session_id = ? AND last_ping >= datetime('now', '-60 seconds')
            ORDER BY role DESC, created_at ASC
            """,
            (session_id,),
        ).fetchall()

        participants = [
            {
                "id": r["id"],
                "name": r["name"],
                "avatar_color": r["avatar_color"],
                "role": r["role"],
            }
            for r in rows
        ]
        return jsonify({"participants": participants, "count": len(participants)}), 200
    finally:
        conn.close()


# ==========================================
# POLLING ENDPOINTS
# ==========================================

@live_bp.post("/sessions/<session_id>/polls")
def create_poll(session_id):
    """Host creates and launches an audience poll."""
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    options = data.get("options") or []
    slide_index = data.get("slide_index", 0)

    if not question:
        return jsonify({"error": "question is required"}), 400
    if not isinstance(options, list) or len(options) < 2:
        return jsonify({"error": "At least 2 options are required"}), 400

    # Clean options
    clean_options = [str(opt).strip() for opt in options if str(opt).strip()]
    if len(clean_options) < 2:
        return jsonify({"error": "At least 2 non-empty options required"}), 400

    poll_id = f"poll_{uuid.uuid4().hex[:10]}"

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        # Close any previous active polls in this session
        conn.execute(
            "UPDATE live_polls SET status = 'closed' WHERE session_id = ? AND status = 'active'",
            (session_id,),
        )

        conn.execute(
            """
            INSERT INTO live_polls (id, session_id, slide_index, question, options, status)
            VALUES (?, ?, ?, ?, ?, 'active')
            """,
            (poll_id, session_id, int(slide_index), question, json.dumps(clean_options)),
        )
        conn.commit()

        return jsonify({
            "poll_id": poll_id,
            "session_id": session_id,
            "slide_index": int(slide_index),
            "question": question,
            "options": [{"index": i, "text": opt, "votes": 0, "percentage": 0} for i, opt in enumerate(clean_options)],
            "total_votes": 0,
            "status": "active",
        }), 201
    finally:
        conn.close()


@live_bp.post("/polls/<poll_id>/vote")
def cast_vote(poll_id):
    """Participant submits a vote."""
    data = request.get_json(silent=True) or {}
    participant_id = data.get("participant_id")
    option_index = data.get("option_index")

    if not participant_id:
        return jsonify({"error": "participant_id is required"}), 400
    if option_index is None:
        return jsonify({"error": "option_index is required"}), 400

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        poll = conn.execute("SELECT id, options, status FROM live_polls WHERE id = ?", (poll_id,)).fetchone()
        if not poll:
            return jsonify({"error": "Poll not found"}), 404
        if poll["status"] != "active":
            return jsonify({"error": "This poll is closed"}), 400

        options = json.loads(poll["options"])
        opt_idx = int(option_index)
        if opt_idx < 0 or opt_idx >= len(options):
            return jsonify({"error": "Invalid option index"}), 400

        vote_id = f"vote_{uuid.uuid4().hex[:10]}"
        # Upsert vote (SQLite 3.24+ support INSERT ... ON CONFLICT)
        conn.execute(
            """
            INSERT INTO live_poll_votes (id, poll_id, participant_id, option_index)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(poll_id, participant_id) DO UPDATE SET option_index = excluded.option_index
            """,
            (vote_id, poll_id, participant_id, opt_idx),
        )
        conn.commit()

        # Recalculate results
        votes = conn.execute(
            "SELECT option_index, COUNT(*) as vote_count FROM live_poll_votes WHERE poll_id = ? GROUP BY option_index",
            (poll_id,),
        ).fetchall()
        vote_map = {r["option_index"]: r["vote_count"] for r in votes}
        total_votes = sum(vote_map.values())

        breakdown = [
            {
                "index": i,
                "text": opt,
                "votes": vote_map.get(i, 0),
                "percentage": round((vote_map.get(i, 0) / total_votes * 100), 1) if total_votes > 0 else 0,
            }
            for i, opt in enumerate(options)
        ]

        return jsonify({
            "poll_id": poll_id,
            "options": breakdown,
            "total_votes": total_votes,
            "has_voted": True,
            "voted_option": opt_idx,
        }), 200
    finally:
        conn.close()


@live_bp.post("/polls/<poll_id>/close")
def close_poll(poll_id):
    """Host closes the poll."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        conn.execute("UPDATE live_polls SET status = 'closed' WHERE id = ?", (poll_id,))
        conn.commit()
        return jsonify({"success": True, "status": "closed"}), 200
    finally:
        conn.close()


# ==========================================
# COMMENTS & AUDIENCE REACTIONS
# ==========================================

@live_bp.get("/sessions/<session_id>/comments")
def get_comments(session_id):
    """Retrieve recent comments and reactions."""
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        rows = conn.execute(
            """
            SELECT id, participant_id, participant_name, slide_index, text, reaction, created_at
            FROM live_comments
            WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT 100
            """,
            (session_id,),
        ).fetchall()

        comments = [
            {
                "id": r["id"],
                "participant_id": r["participant_id"],
                "participant_name": r["participant_name"],
                "slide_index": r["slide_index"],
                "text": r["text"],
                "reaction": r["reaction"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
        return jsonify({"comments": comments}), 200
    finally:
        conn.close()


@live_bp.post("/sessions/<session_id>/comments")
def post_comment(session_id):
    """Post comment or emoji reaction from attendee or host."""
    data = request.get_json(silent=True) or {}
    participant_id = data.get("participant_id")
    participant_name = (data.get("participant_name") or "Anonymous").strip()
    slide_index = int(data.get("slide_index", 0))
    text = (data.get("text") or "").strip()
    reaction = (data.get("reaction") or "").strip()

    if not text and not reaction:
        return jsonify({"error": "Comment text or reaction is required"}), 400

    comment_id = f"cmt_{uuid.uuid4().hex[:10]}"
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        conn.execute(
            """
            INSERT INTO live_comments (id, session_id, participant_id, participant_name, slide_index, text, reaction)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (comment_id, session_id, participant_id, participant_name, slide_index, text, reaction),
        )
        conn.commit()

        return jsonify({
            "id": comment_id,
            "session_id": session_id,
            "participant_id": participant_id,
            "participant_name": participant_name,
            "slide_index": slide_index,
            "text": text,
            "reaction": reaction,
        }), 201
    finally:
        conn.close()
