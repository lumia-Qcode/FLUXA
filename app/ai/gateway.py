"""AI gateway (ROADMAP F3, PERFORMANCE.md D2), adapted to the free-model router.

Every AI feature runs inside `gateway.session(feature, ...)`. Inside it:
- the provider asks `effort()` for the reasoning effort of that feature (low for chat
  edits, high for outlines), so quick features don't burn reasoning tokens;
- each model call is logged to `ai_usage` (org, user, feature, route, tokens, latency,
  status) through `record()`;
- any code path that substitutes template content for model output calls
  `mark_fallback(reason)`, and the route returns `status()` so the UI can say so instead
  of passing a template off as AI work;
- `cached()` keeps deterministic results per organisation (never shared across orgs, and
  never caching a fallback), which also saves the free daily quota.

The context lives in a ContextVar, so it also works inside streamed responses, where
Flask's request context is gone: capture org/user/db path before streaming starts and
open the session inside the generator.
"""

import contextlib
import contextvars
import hashlib
import json
import logging
import sqlite3
import time
from typing import Any, Callable, Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)

# Reasoning effort per feature. Unknown features use "medium".
FEATURE_EFFORT: Dict[str, str] = {
    # Medium, not high: the free reasoning model spent 25-50 s per call thinking at "high".
    "outline.generate": "medium",
    "deck.generate": "medium",
    "research.live": "medium",
    "slide.generate": "medium",
    "slide.enhance": "low",
    "copilot.chat": "low",
    # Part B deck features (one call each)
    "rehearse.audience": "medium",
    "rehearse.debate": "high",
    "timing.plan": "medium",
    "demo.generate": "high",
    "map.generate": "high",
    "audience.ask": "low",
    "decision.model": "high",
    "captions.translate": "low",
    "narration.generate": "medium",
}

CACHE_TTL_S: Dict[str, int] = {"outline.generate": 24 * 3600, "map.generate": 7 * 24 * 3600, "narration.generate": 7 * 24 * 3600}

_ctx: contextvars.ContextVar[Optional[Dict[str, Any]]] = contextvars.ContextVar("fluxa_ai_ctx", default=None)
_prompt: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("fluxa_ai_prompt", default=None)


def init_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS ai_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id INTEGER,
            user_id INTEGER,
            feature TEXT NOT NULL,
            route TEXT,
            effort TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_ms INTEGER,
            status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_org ON ai_usage(org_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage(feature, created_at);
        CREATE TABLE IF NOT EXISTS ai_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at REAL NOT NULL
        );
        """
    )
    cols = {r[1] for r in connection.execute("PRAGMA table_info(ai_usage)").fetchall()}
    if "prompt" not in cols:
        connection.execute("ALTER TABLE ai_usage ADD COLUMN prompt TEXT")


@contextlib.contextmanager
def using_prompt(key: str) -> Iterator[None]:
    """Tag model calls made inside this block with a prompt id@version (per thread / context)."""
    token = _prompt.set(key)
    try:
        yield
    finally:
        _prompt.reset(token)


@contextlib.contextmanager
def session(
    feature: str,
    org_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db_path: Optional[str] = None,
) -> Iterator[Dict[str, Any]]:
    """Run AI work for one feature. Nested sessions keep the outer feature's fallbacks."""
    outer = _ctx.get()
    ctx = {
        "feature": feature,
        "org_id": org_id if org_id is not None else (outer or {}).get("org_id"),
        "user_id": user_id if user_id is not None else (outer or {}).get("user_id"),
        "db_path": db_path or (outer or {}).get("db_path"),
        "fallbacks": (outer or {}).get("fallbacks", []) if outer else [],
        "calls": 0,
    }
    token = _ctx.set(ctx)
    try:
        yield ctx
    finally:
        _ctx.reset(token)


def request_session(feature: str):
    """A session for the current Flask request (org/user from flask.g)."""
    from flask import current_app, g

    return session(feature, g.get("org_id"), g.get("user_id"), current_app.config.get("DATABASE_PATH"))


def current_feature() -> str:
    ctx = _ctx.get()
    return ctx["feature"] if ctx else "unscoped"


def effort() -> str:
    return FEATURE_EFFORT.get(current_feature(), "medium")


def mark_fallback(reason: str) -> None:
    """Record that template content replaced model output in this session."""
    ctx = _ctx.get()
    logger.warning("AI fallback in %s: %s", current_feature(), reason)
    if ctx is not None and reason not in ctx["fallbacks"]:
        ctx["fallbacks"].append(reason[:200])


def status() -> Dict[str, Any]:
    """`{"mode": "live"}` or `{"mode": "fallback", "reasons": [...]}` for API responses."""
    ctx = _ctx.get()
    reasons: List[str] = list(ctx["fallbacks"]) if ctx else []
    return {"mode": "fallback", "reasons": reasons} if reasons else {"mode": "live"}


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def record(route: str, status_text: str, usage: Optional[Dict[str, Any]] = None, total_ms: int = 0) -> None:
    """Log one model call. Never raises: usage logging must not break AI features."""
    ctx = _ctx.get()
    if ctx is None:
        return
    ctx["calls"] += 1
    if not ctx.get("db_path"):
        return
    usage = usage or {}
    try:
        conn = _connect(ctx["db_path"])
        try:
            conn.execute(
                """
                INSERT INTO ai_usage (org_id, user_id, feature, route, effort, input_tokens, output_tokens, total_ms, status, prompt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ctx["org_id"],
                    ctx["user_id"],
                    ctx["feature"],
                    route,
                    effort(),
                    usage.get("prompt_tokens"),
                    usage.get("completion_tokens"),
                    int(total_ms),
                    status_text[:60],
                    _prompt.get(),
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:  # pragma: no cover - logging must never fail a request
        logger.warning("Could not record AI usage: %s", exc)


def _cache_key(feature: str, inputs: Dict[str, Any]) -> str:
    ctx = _ctx.get() or {}
    digest = hashlib.sha256(json.dumps(inputs, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    return f"org:{ctx.get('org_id')}:{feature}:{digest}"


def cached(feature: str, inputs: Dict[str, Any], compute: Callable[[], Any]) -> Any:
    """Return a cached result for (org, feature, inputs) or compute and store it.

    Results produced while a fallback was marked are returned but not stored.
    """
    ctx = _ctx.get()
    ttl = CACHE_TTL_S.get(feature)
    if not ctx or not ctx.get("db_path") or not ttl:
        return compute()
    key = _cache_key(feature, inputs)
    try:
        conn = _connect(ctx["db_path"])
        try:
            row = conn.execute("SELECT value, expires_at FROM ai_cache WHERE key = ?", (key,)).fetchone()
        finally:
            conn.close()
        if row and row["expires_at"] > time.time():
            ctx["cache_hit"] = True
            return json.loads(row["value"])
    except Exception as exc:
        logger.warning("AI cache read failed: %s", exc)

    fallbacks_before = len(ctx["fallbacks"])
    value = compute()
    if len(ctx["fallbacks"]) == fallbacks_before:
        try:
            conn = _connect(ctx["db_path"])
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO ai_cache (key, value, expires_at) VALUES (?, ?, ?)",
                    (key, json.dumps(value, default=str), time.time() + ttl),
                )
                conn.execute("DELETE FROM ai_cache WHERE expires_at < ?", (time.time(),))
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("AI cache write failed: %s", exc)
    return value


def usage_summary(connection: sqlite3.Connection, org_id: int, days: int = 7) -> List[Dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT feature,
               COUNT(*) AS calls,
               SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_calls,
               COALESCE(SUM(input_tokens), 0) AS input_tokens,
               COALESCE(SUM(output_tokens), 0) AS output_tokens,
               CAST(AVG(CASE WHEN status = 'ok' THEN total_ms END) AS INTEGER) AS avg_ms
        FROM ai_usage
        WHERE org_id = ? AND created_at >= datetime('now', ?)
        GROUP BY feature ORDER BY calls DESC
        """,
        (org_id, f"-{int(days)} days"),
    ).fetchall()
    return [dict(r) for r in rows]


def feature(name: str):
    """Decorator for JSON routes: run the view in a session and add `"ai": status()`."""
    import functools

    def decorator(view):
        @functools.wraps(view)
        def wrapped(*args, **kwargs):
            with request_session(name) as ctx:
                rv = view(*args, **kwargs)
                parts = list(rv) if isinstance(rv, tuple) else [rv]
                if isinstance(parts[0], dict):
                    body = dict(parts[0])
                    body["ai"] = {**status(), **({"cached": True} if ctx.get("cache_hit") else {})}
                    parts[0] = body
                return tuple(parts) if isinstance(rv, tuple) else parts[0]

        return wrapped

    return decorator


def with_status_on_done(chunks: Iterator[str]) -> Iterator[str]:
    """Pass SSE chunks through, adding the session's AI status to the `done` event."""
    for chunk in chunks:
        if chunk.startswith("event: done\ndata: "):
            try:
                payload = json.loads(chunk[len("event: done\ndata: "):].strip())
                payload["ai"] = status()
                chunk = f"event: done\ndata: {json.dumps(payload)}\n\n"
            except Exception:
                pass
        yield chunk
