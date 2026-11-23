"""Make Copilot's operations land on the deck.

The model's ops often missed: an id copied wrong ("title" instead of "blk-title-3f2a"), a
field name the editor doesn't use ("new_text", "blockId", props at the top level), an op name
outside the supported set ("update_text"), an image URL it made up, or nothing at all while the
reply claimed "Done". The editor then applied nothing and the user saw no change.

`normalize_ops` rewrites what can be resolved unambiguously, drops what can't, and reports
every problem so the route can retry once with specific feedback and tell the user plainly
which part of the request was not done.
"""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional, Tuple

SUPPORTED = {
    "set_block_props", "add_block", "remove_block", "set_dataset", "set_dataset_cell", "add_variable",
    "add_slide", "remove_slide", "reorder_slides", "apply_layout", "apply_theme", "set_animation",
    "set_notes", "update_chart", "restyle", "set_image",
}
ALIASES = {
    "update_text": "set_block_props", "set_text": "set_block_props", "edit_text": "set_block_props",
    "replace_text": "set_block_props", "update_block": "set_block_props", "modify_block": "set_block_props",
    "edit_block": "set_block_props", "set_props": "set_block_props", "update_props": "set_block_props",
    "change_layout": "apply_layout", "set_layout": "apply_layout", "delete_block": "remove_block",
    "insert_block": "add_block", "create_block": "add_block", "delete_slide": "remove_slide",
    "insert_slide": "add_slide", "create_slide": "add_slide", "set_chart": "update_chart",
    "update_chart_data": "update_chart", "style_block": "restyle", "set_style": "restyle",
    "update_notes": "set_notes", "set_speaker_notes": "set_notes", "change_image": "set_image",
    "replace_image": "set_image", "add_image": "set_image", "set_theme": "apply_theme",
}
TEXT_KEYS = {"new_text": "text", "content": "text", "value_text": "text", "points": "bullets", "items": "bullets", "size": "fontSize", "font_size": "fontSize"}
META_KEYS = {"op", "block_id", "blockId", "id", "target", "target_id", "slide_id", "slideId", "props", "block", "slide"}

_EDIT_WORDS = re.compile(
    r"\b(change|make|add|insert|remove|delete|replace|rewrite|shorten|shorter|expand|longer|translate|move|resize|"
    r"bigger|smaller|larger|update|set|turn|convert|put|fix|correct|rename|swap|bold|italic|color|colour|font|"
    r"align|center|centre|split|merge|reorder|summari[sz]e|simplify|edit|modify|improve|use|show|hide|"
    r"bara|chota|badlo|likho|hatao|daalo|dalo|banao|bana|karo|kar do)\b",
    re.I,
)
_QUESTION = re.compile(r"^\s*(what|why|how|who|when|where|which|is|are|can you explain|explain|tell me)\b|\?\s*$", re.I)


def looks_like_edit(message: str) -> bool:
    """Imperative edit request (vs. a question about the slide)."""
    text = message.strip()
    if _QUESTION.search(text) and not re.search(r"\b(can you|could you|please|would you)\b", text, re.I):
        return False
    return bool(_EDIT_WORDS.search(text))


def _blocks_by_slide(slides: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {s.get("id"): s for s in slides if isinstance(s, dict)}


def _find_block(slides: List[Dict[str, Any]], block_id: str) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    for s in slides:
        for b in s.get("blocks") or []:
            if isinstance(b, dict) and b.get("id") == block_id:
                return s, b
    return None


def _resolve_block(ref: Any, slides: List[Dict[str, Any]], active: Dict[str, Any], selected: List[str]) -> Optional[str]:
    """Map the model's block reference to a real block id, only when the match is unambiguous."""
    if not ref and len(selected) == 1:
        return selected[0]
    if not isinstance(ref, str) or not ref.strip():
        return None
    ref = ref.strip()
    if _find_block(slides, ref):
        return ref
    blocks = [b for b in active.get("blocks") or [] if isinstance(b, dict)]
    low = ref.lower()
    # Case/whitespace slips, or a truncated id ("blk-title-3f2a" vs "blk-title-3f2a91bc").
    hits = [b for b in blocks if str(b.get("id", "")).lower() == low or str(b.get("id", "")).lower().startswith(low) and len(low) >= 8]
    if len(hits) == 1:
        return hits[0]["id"]
    # A role or kind instead of an id ("title", "body", "chart", "image", "subtitle").
    word = re.sub(r"^(blk|block)[-_]?", "", low).split("-")[0]
    role_alias = {"heading": "title", "headline": "title", "bullets": "body", "text": "body", "content": "body", "photo": "media", "image": "media", "picture": "media"}
    role = role_alias.get(word, word)
    by_role = [b for b in blocks if b.get("role") == role] or [b for b in blocks if b.get("type") == word or b.get("type") == role]
    if len(by_role) == 1:
        return by_role[0]["id"]
    if selected and len(selected) == 1 and any(b.get("id") == selected[0] for b in blocks):
        return selected[0]
    return None


def _flatten_props(op: Dict[str, Any]) -> Dict[str, Any]:
    props = dict(op.get("props") or {}) if isinstance(op.get("props"), dict) else {}
    for k, v in op.items():
        if k not in META_KEYS and k not in props:
            props[k] = v
    for old, new in TEXT_KEYS.items():
        if old in props and new not in props:
            props[new] = props.pop(old)
    if isinstance(props.get("bullets"), str):
        props["bullets"] = [x.strip(" -•\t") for x in props["bullets"].splitlines() if x.strip(" -•\t")]
    if isinstance(props.get("bullets"), list):
        props["bullets"] = [b if isinstance(b, str) else str((b or {}).get("text", b)) for b in props["bullets"]]
    return props


def _resolve_slide(ref: Any, slides: List[Dict[str, Any]]) -> Optional[str]:
    if ref is None:
        return None
    ids = [s.get("id") for s in slides]
    if ref in ids:
        return ref
    if isinstance(ref, (int, float)) or (isinstance(ref, str) and ref.strip().isdigit()):
        n = int(ref)
        if 1 <= n <= len(slides):
            return slides[n - 1].get("id")  # "slide 3" as a number
        if f"slide-{n}" in ids:
            return f"slide-{n}"
    m = re.match(r"slide[-_ ]?(\d+)$", str(ref).strip(), re.I)
    if m and 1 <= int(m.group(1)) <= len(slides) and f"slide-{m.group(1)}" not in ids:
        return slides[int(m.group(1)) - 1].get("id")
    return None


def normalize_ops(
    raw_ops: Any,
    slides: List[Dict[str, Any]],
    active: Dict[str, Any],
    selected: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Return (ops the editor can apply, problems). `slides` are the deck's slides as the editor has them."""
    selected = [s for s in (selected or []) if isinstance(s, str)]
    ops: List[Dict[str, Any]] = []
    problems: List[str] = []
    if isinstance(raw_ops, dict):
        raw_ops = [raw_ops]
    for raw in raw_ops if isinstance(raw_ops, list) else []:
        if not isinstance(raw, dict):
            continue
        op = copy.deepcopy(raw)
        name = str(op.get("op") or op.get("type") or op.get("action") or "").strip().lower()
        name = ALIASES.get(name, name)
        if name not in SUPPORTED:
            problems.append(f"unsupported operation '{name or '?'}'")
            continue
        op["op"] = name
        if name in ("set_block_props", "update_chart", "restyle", "remove_block", "set_animation", "set_image"):
            ref = op.get("block_id") or op.get("blockId") or op.get("id") or op.get("target") or op.get("target_id")
            bid = _resolve_block(ref, slides, active, selected)
            if not bid:
                if name == "set_image":
                    media = [b for b in active.get("blocks") or [] if isinstance(b, dict) and b.get("type") == "image"]
                    bid = media[0]["id"] if len(media) == 1 else None
                if not bid:
                    problems.append(f"{name}: block '{ref}' is not on the slide")
                    continue
            clean = {"op": name, "block_id": bid}
            if name in ("set_block_props", "update_chart", "restyle", "set_image"):
                props = _flatten_props(op)
                if not props:
                    problems.append(f"{name} on {bid} had no changes")
                    continue
                clean["props"] = props
            if name == "set_animation":
                clean["animation"] = op.get("animation") or (op.get("props") or {}).get("animation")
            ops.append(clean)
        elif name in ("add_block",):
            block = op.get("block") if isinstance(op.get("block"), dict) else {k: v for k, v in op.items() if k not in ("op", "slide_id")}
            if not block.get("type"):
                problems.append("add_block without a block type")
                continue
            clean = {"op": name, "block": block}
            sid = _resolve_slide(op.get("slide_id") or op.get("slideId"), slides)
            if sid:
                clean["slide_id"] = sid
            ops.append(clean)
        elif name in ("set_notes", "remove_slide", "apply_layout"):
            clean = {k: v for k, v in op.items() if k not in ("slideId",)}
            if op.get("slide_id") is not None or op.get("slideId") is not None:
                sid = _resolve_slide(op.get("slide_id") or op.get("slideId"), slides)
                if not sid:
                    problems.append(f"{name}: slide '{op.get('slide_id') or op.get('slideId')}' does not exist")
                    continue
                clean["slide_id"] = sid
            if name == "set_notes" and not isinstance(clean.get("notes"), str):
                clean["notes"] = str((op.get("props") or {}).get("notes") or op.get("text") or "")
                if not clean["notes"]:
                    problems.append("set_notes without notes")
                    continue
            if name == "apply_layout" and not clean.get("layout"):
                problems.append("apply_layout without a layout")
                continue
            ops.append(clean)
        else:
            ops.append(op)
    return ops, problems


def simulate(slides: List[Dict[str, Any]], ops: List[Dict[str, Any]], active_id: Optional[str]) -> bool:
    """True when the ops would change the deck (block props, text, boxes, notes, layout, slides)."""
    if not ops:
        return False
    for op in ops:
        name = op["op"]
        if name in ("add_block", "remove_block", "add_slide", "remove_slide", "reorder_slides", "apply_theme",
                    "set_dataset", "set_dataset_cell", "add_variable", "set_animation", "set_image"):
            return True
        if name == "set_notes":
            target = next((s for s in slides if s.get("id") == (op.get("slide_id") or active_id)), None)
            if target is None or (target.get("notes") or "") != op.get("notes"):
                return True
        if name == "apply_layout":
            target = next((s for s in slides if s.get("id") == (op.get("slide_id") or active_id)), None)
            if target is None or target.get("layout") != op.get("layout"):
                return True
        if name in ("set_block_props", "update_chart", "restyle"):
            found = _find_block(slides, op["block_id"])
            if not found:
                continue
            _, block = found
            props = block.get("props") or {}
            for k, v in op.get("props", {}).items():
                current = block.get(k, props.get(k, (block.get("style") or {}).get(k)))
                if k == "text":
                    current = block.get("content", props.get("text", block.get("text")))
                if current != v:
                    return True
    return False


def resolve_images(ops: List[Dict[str, Any]], topic: str) -> List[str]:
    """Turn set_image {query} into a real, credited Wikimedia image; report queries with no result."""
    problems = []
    finder = None
    for op in ops:
        if op["op"] != "set_image":
            continue
        props = op.get("props") or {}
        query = str(props.get("query") or props.get("description") or props.get("alt") or "").strip()
        if not query:
            problems.append("set_image without a description of the image")
            op["op"] = "_drop"
            continue
        if finder is None:
            from app.ai.image_search import ImageFinder

            finder = ImageFinder(topic, [], max_searches=3)
        img = finder.find(query, query)
        if not img:
            problems.append(f"no suitable free image was found for '{query}'")
            op["op"] = "_drop"
            continue
        op["op"] = "set_block_props"
        op["props"] = {"assetId": img["url"], "url": img["url"], "alt": img["alt"], "credit": img["credit"],
                       "sourcePage": img["source_page"], "license": img["license"], "model3d": None, "sketchfab": None}
    ops[:] = [o for o in ops if o["op"] != "_drop"]
    return problems
