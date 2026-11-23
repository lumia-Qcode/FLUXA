"""Deterministic extraction from checked files (no AI).

Every extractor returns the same shape:
    {"kind", "meta": {...}, "colors": [{"hex", "count", "source"}], "fonts": [{"family", "count", "source"}],
     "text": [{"ref", "text"}], "injection_suspected": bool, "warnings": [...]}

Extracted text is untrusted data. Anything that later sends it to a model must wrap it
(app.prompts.registry.wrap_untrusted); `injection_suspected` flags text that reads like
instructions to an AI so the review screen can point it out.
"""

from __future__ import annotations

import re
import zipfile
from collections import Counter
from typing import Any, Dict, List

import defusedxml.ElementTree as SafeET

from app.ingest.sniff import FONT_KINDS, IMAGE_KINDS

MAX_TEXT_ITEMS = 300
MAX_TEXT_PER_ITEM = 4000
MAX_TEXT_TOTAL = 200_000
MAX_PDF_PAGES = 60

A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

_INJECTION = re.compile(
    r"ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)|disregard (the|all|your) (instructions|rules)"
    r"|you are (now )?(chatgpt|an? ai|a language model)|system prompt|</?(system|assistant|instructions?)>"
    r"|reveal (your|the) (prompt|instructions|secrets?)",
    re.IGNORECASE,
)
_HEX6 = re.compile(r"#([0-9a-fA-F]{6})\b")
_HEX3 = re.compile(r"#([0-9a-fA-F]{3})\b")


def _result(kind: str) -> Dict[str, Any]:
    return {"kind": kind, "meta": {}, "colors": [], "fonts": [], "text": [], "injection_suspected": False, "warnings": []}


def _add_text(out: Dict[str, Any], ref: str, text: str) -> None:
    text = re.sub(r"[ \t]+", " ", (text or "")).strip()
    if not text or len(out["text"]) >= MAX_TEXT_ITEMS:
        return
    used = sum(len(t["text"]) for t in out["text"])
    room = MAX_TEXT_TOTAL - used
    if room <= 0:
        if "text_truncated" not in out["warnings"]:
            out["warnings"].append("text_truncated")
        return
    text = text[: min(MAX_TEXT_PER_ITEM, room)]
    out["text"].append({"ref": ref, "text": text})
    if _INJECTION.search(text):
        out["injection_suspected"] = True


def _top(counter: Counter, source: str, key: str, limit: int = 24) -> List[Dict[str, Any]]:
    return [{key: k, "count": n, "source": source} for k, n in counter.most_common(limit)]


def _norm_hex(value: str) -> str:
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return "#" + value.upper()


# --- PPTX -----------------------------------------------------------------------------

def extract_pptx(path: str) -> Dict[str, Any]:
    from pptx import Presentation
    from pptx.util import Emu

    out = _result("pptx")
    theme_colors: Dict[str, str] = {}
    theme_fonts: Dict[str, str] = {}
    usage_colors: Counter = Counter()
    usage_fonts: Counter = Counter()
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        theme_name = next((n for n in sorted(names) if re.fullmatch(r"ppt/theme/theme\d+\.xml", n)), None)
        if theme_name:
            root = SafeET.fromstring(zf.read(theme_name), forbid_dtd=True)
            scheme = root.find(f".//{A_NS}clrScheme")
            if scheme is not None:
                for slot in scheme:
                    tag = slot.tag.replace(A_NS, "")
                    srgb = slot.find(f"{A_NS}srgbClr")
                    sysc = slot.find(f"{A_NS}sysClr")
                    val = srgb.get("val") if srgb is not None else (sysc.get("lastClr") if sysc is not None else None)
                    if val and re.fullmatch(r"[0-9A-Fa-f]{6}", val):
                        theme_colors[tag] = _norm_hex(val)
            for role, tag in (("heading", "majorFont"), ("body", "minorFont")):
                latin = root.find(f".//{A_NS}fontScheme/{A_NS}{tag}/{A_NS}latin")
                if latin is not None and latin.get("typeface"):
                    theme_fonts[role] = latin.get("typeface")
        for name in names:
            if re.fullmatch(r"ppt/(slides|slideMasters|slideLayouts)/[^/]+\.xml", name):
                xml = zf.read(name).decode("utf-8", "ignore")
                usage_colors.update(_norm_hex(v) for v in re.findall(r'srgbClr val="([0-9A-Fa-f]{6})"', xml))
                usage_fonts.update(f for f in re.findall(r'<a:latin typeface="([^"+][^"]*)"', xml) if not f.startswith("+"))

    prs = Presentation(path)
    out["meta"] = {
        "slides": len(prs.slides),
        "width_px": round(Emu(prs.slide_width).inches * 96) if prs.slide_width else None,
        "height_px": round(Emu(prs.slide_height).inches * 96) if prs.slide_height else None,
        "masters": len(prs.slide_masters),
        "layouts": [layout.name for master in prs.slide_masters for layout in master.slide_layouts][:60],
        "theme_colors": theme_colors,
        "theme_fonts": theme_fonts,
    }
    footers: Counter = Counter()
    for i, slide in enumerate(prs.slides, start=1):
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                parts.append(shape.text_frame.text)
                if shape.is_placeholder and shape.placeholder_format.type is not None:
                    if "FOOTER" in str(shape.placeholder_format.type):
                        footers[shape.text_frame.text.strip()[:200]] += 1
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                parts.append("Notes: " + notes)
        _add_text(out, f"slide {i}", "\n".join(parts))
    if footers:
        out["meta"]["footer_texts"] = [t for t, _ in footers.most_common(5)]
    colors = Counter({hexv: 1000 for hexv in theme_colors.values()})  # theme colours first
    colors.update(usage_colors)
    out["colors"] = [
        {"hex": h, "count": usage_colors.get(h, 0), "source": "theme" if h in theme_colors.values() else "slides"}
        for h, _ in colors.most_common(24)
    ]
    fonts = Counter({f: 1000 for f in theme_fonts.values()})
    fonts.update(usage_fonts)
    out["fonts"] = [
        {"family": f, "count": usage_fonts.get(f, 0), "source": "theme" if f in theme_fonts.values() else "slides"}
        for f, _ in fonts.most_common(12)
    ]
    return out


# --- PDF ------------------------------------------------------------------------------

def extract_pdf(path: str) -> Dict[str, Any]:
    from pypdf import PdfReader

    out = _result("pdf")
    reader = PdfReader(path, strict=False)
    meta = reader.metadata or {}
    out["meta"] = {"pages": len(reader.pages), "title": str(meta.get("/Title") or "")[:200]}
    fonts: Counter = Counter()
    for i, page in enumerate(reader.pages, start=1):
        try:
            resources = page.get("/Resources") or {}
            font_dict = resources.get("/Font") or {}
            for ref in font_dict.values():
                base = str(ref.get_object().get("/BaseFont") or "").lstrip("/")
                base = re.sub(r"^[A-Z]{6}\+", "", base)  # subset prefix
                if base:
                    fonts[base.replace("#20", " ")] += 1
        except Exception:
            pass
        if i <= MAX_PDF_PAGES:
            try:
                _add_text(out, f"page {i}", page.extract_text() or "")
            except Exception:
                out["warnings"].append(f"page {i}: text could not be read")
    if len(reader.pages) > MAX_PDF_PAGES:
        out["warnings"].append(f"text read from the first {MAX_PDF_PAGES} pages only")
    out["fonts"] = _top(fonts, "pdf", "family", 12)
    return out


# --- DOCX -----------------------------------------------------------------------------

def extract_docx(path: str) -> Dict[str, Any]:
    out = _result("docx")
    with zipfile.ZipFile(path) as zf:
        root = SafeET.fromstring(zf.read("word/document.xml"), forbid_dtd=True)
        styles = zf.read("word/styles.xml").decode("utf-8", "ignore") if "word/styles.xml" in zf.namelist() else ""
    paras = []
    for p in root.iter(f"{W_NS}p"):
        text = "".join(t.text or "" for t in p.iter(f"{W_NS}t"))
        if text.strip():
            paras.append(text)
    out["meta"] = {"paragraphs": len(paras)}
    chunk, n = [], 1
    for para in paras:
        chunk.append(para)
        if sum(len(c) for c in chunk) > 3000:
            _add_text(out, f"part {n}", "\n".join(chunk))
            chunk, n = [], n + 1
    if chunk:
        _add_text(out, f"part {n}", "\n".join(chunk))
    fonts = Counter(re.findall(r'w:ascii="([^"]+)"', styles))
    out["fonts"] = _top(fonts, "styles", "family", 8)
    out["colors"] = _top(Counter(_norm_hex(c) for c in re.findall(r'w:color w:val="([0-9A-Fa-f]{6})"', styles)), "styles", "hex", 12)
    return out


# --- Images ---------------------------------------------------------------------------

def extract_image(path: str, kind: str) -> Dict[str, Any]:
    from PIL import Image

    out = _result(kind)
    with Image.open(path) as img:
        out["meta"] = {"width": img.width, "height": img.height, "format": img.format, "mode": img.mode,
                       "has_alpha": img.mode in ("RGBA", "LA") or "transparency" in img.info}
        thumb = img.convert("RGBA")
        thumb.thumbnail((160, 160))
    pixels = [(r, g, b) for r, g, b, a in thumb.getdata() if a >= 128]
    if pixels:
        solid = Image.new("RGB", (len(pixels), 1))
        solid.putdata(pixels)
        quant = solid.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
        palette = quant.getpalette() or []
        counts = sorted(quant.getcolors() or [], reverse=True)
        total = sum(c for c, _ in counts) or 1
        out["colors"] = [
            {"hex": "#%02X%02X%02X" % tuple(palette[idx * 3: idx * 3 + 3]), "count": c, "share": round(c / total, 3), "source": "pixels"}
            for c, idx in counts
        ]
    return out


# --- SVG ------------------------------------------------------------------------------

def extract_svg(path: str) -> Dict[str, Any]:
    out = _result("svg")
    with open(path, "rb") as fh:
        data = fh.read()
    root = SafeET.fromstring(data, forbid_dtd=True)
    out["meta"] = {k: root.get(k) for k in ("width", "height", "viewBox") if root.get(k)}
    text = data.decode("utf-8", "ignore")
    colors = Counter(_norm_hex(m) for m in _HEX6.findall(text))
    colors.update(_norm_hex(m) for m in _HEX3.findall(text))
    out["colors"] = _top(colors, "svg", "hex", 16)
    texts = " ".join(t for t in root.itertext() if t.strip())
    _add_text(out, "svg text", texts)
    return out


# --- Fonts ----------------------------------------------------------------------------

EMBEDDING = {0: "installable", 2: "restricted", 4: "preview_print", 8: "editable"}


def extract_font(path: str, kind: str) -> Dict[str, Any]:
    from fontTools.ttLib import TTFont

    out = _result(kind)
    font = TTFont(path, lazy=True)
    try:
        def name(i):
            rec = font["name"].getDebugName(i) if "name" in font else None
            return (rec or "")[:300]

        fs_type = font["OS/2"].fsType if "OS/2" in font else 0
        usage = fs_type & 0x000F
        embedding = EMBEDDING.get(usage, "restricted" if usage & 2 else "unknown")
        out["meta"] = {
            "family": name(16) or name(1),
            "subfamily": name(17) or name(2),
            "full_name": name(4),
            "postscript_name": name(6),
            "weight": font["OS/2"].usWeightClass if "OS/2" in font else None,
            "italic": bool(font["OS/2"].fsSelection & 1) if "OS/2" in font else None,
            "fs_type": fs_type,
            "embedding": embedding,
            "embeddable": embedding in ("installable", "editable", "preview_print") and not fs_type & 0x0200,
            "no_subsetting": bool(fs_type & 0x0100),
            "license": name(13),
            "license_url": name(14),
            "glyphs": font["maxp"].numGlyphs if "maxp" in font else None,
        }
        if out["meta"]["family"]:
            out["fonts"] = [{"family": out["meta"]["family"], "count": 1, "source": "font file"}]
    finally:
        font.close()
    return out


def extract(path: str, kind: str) -> Dict[str, Any]:
    if kind == "pptx":
        return extract_pptx(path)
    if kind == "pdf":
        return extract_pdf(path)
    if kind == "docx":
        return extract_docx(path)
    if kind in IMAGE_KINDS:
        return extract_image(path, kind)
    if kind == "svg":
        return extract_svg(path)
    if kind in FONT_KINDS:
        return extract_font(path, kind)
    raise ValueError(f"no extractor for {kind}")
