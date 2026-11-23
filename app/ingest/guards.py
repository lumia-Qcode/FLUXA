"""Safety checks for uploaded files: size limits, zip bombs, encrypted PDFs, SVG cleaning.

Each check raises Rejected with a message that is safe to show the user.
"""

from __future__ import annotations

import re
import zipfile
from typing import Optional
from xml.etree.ElementTree import Element, register_namespace, tostring

import defusedxml.ElementTree as SafeET
from defusedxml import DefusedXmlException

from app.ingest.sniff import FONT_KINDS, IMAGE_KINDS

MB = 1024 * 1024
SIZE_LIMITS = {"pptx": 50 * MB, "pdf": 50 * MB, "docx": 50 * MB, "svg": 2 * MB}
SIZE_LIMITS.update({k: 10 * MB for k in IMAGE_KINDS})
SIZE_LIMITS.update({k: 5 * MB for k in FONT_KINDS})
MAX_FILES_PER_BATCH = 30
MAX_ZIP_ENTRIES = 5000
MAX_ZIP_UNCOMPRESSED = 200 * MB
MAX_ZIP_RATIO = 100
MAX_IMAGE_PIXELS = 60_000_000  # about 7700 x 7700


class Rejected(Exception):
    """The file is refused; str(exc) is shown to the user."""


def check_size(kind: str, size: int) -> None:
    limit = SIZE_LIMITS.get(kind)
    if limit is None:
        raise Rejected("This file type isn't supported.")
    if size <= 0:
        raise Rejected("The file is empty.")
    if size > limit:
        raise Rejected(f"The file is larger than the {limit // MB} MB limit for this type.")


def check_zip(path: str) -> None:
    """Refuse zip bombs and odd entries in Office files."""
    try:
        with zipfile.ZipFile(path) as zf:
            infos = zf.infolist()
    except zipfile.BadZipFile:
        raise Rejected("The file is damaged or isn't a valid Office document.") from None
    if len(infos) > MAX_ZIP_ENTRIES:
        raise Rejected("The document has too many internal parts.")
    total = 0
    for info in infos:
        name = info.filename
        if name.startswith(("/", "\\")) or ".." in name.replace("\\", "/").split("/") or ":" in name:
            raise Rejected("The document contains unsafe internal paths.")
        if info.flag_bits & 0x1:
            raise Rejected("Encrypted documents aren't supported.")
        total += info.file_size
        if info.compress_size and info.file_size / info.compress_size > MAX_ZIP_RATIO and info.file_size > MB:
            raise Rejected("The document looks like a compression bomb and was refused.")
    if total > MAX_ZIP_UNCOMPRESSED:
        raise Rejected("The document is too large once unpacked.")


def check_pdf(path: str) -> None:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            raise Rejected("Password-protected PDFs aren't supported. Remove the password and upload again.")
        _ = len(reader.pages)
    except Rejected:
        raise
    except (PdfReadError, ValueError, KeyError, OSError):
        raise Rejected("The PDF is damaged and couldn't be read.") from None


def check_image(path: str) -> None:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with Image.open(path) as img:
            w, h = img.size
            if w * h > MAX_IMAGE_PIXELS:
                raise Rejected("The image is too large (too many pixels).")
            img.verify()
    except Rejected:
        raise
    except Image.DecompressionBombError:
        raise Rejected("The image is too large (too many pixels).") from None
    except Exception:
        raise Rejected("The image is damaged and couldn't be read.") from None


def check_font(path: str) -> None:
    from fontTools.ttLib import TTFont

    try:
        TTFont(path, lazy=True).close()
    except Exception:
        raise Rejected("The font file is damaged and couldn't be read.") from None


# --- SVG ------------------------------------------------------------------------------

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
register_namespace("", SVG_NS)
register_namespace("xlink", XLINK_NS)
_ALLOWED_TAGS = {
    "svg", "g", "defs", "title", "desc", "symbol", "use", "path", "rect", "circle", "ellipse", "line",
    "polyline", "polygon", "text", "tspan", "textPath", "linearGradient", "radialGradient", "stop",
    "clipPath", "mask", "pattern", "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
    "feMerge", "feMergeNode", "feFlood", "feComposite", "marker", "style", "metadata",
}
_URL_IN_CSS = re.compile(r"url\(\s*['\"]?\s*(?!#)[^)]*\)", re.IGNORECASE)
_CSS_DANGER = re.compile(r"@import|expression\s*\(|javascript:|behavior\s*:", re.IGNORECASE)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def sanitize_svg(data: bytes) -> bytes:
    """Return a cleaned SVG: only drawing elements, no scripts, event handlers,
    external references, foreignObject or entities. Raises Rejected if it can't be parsed."""
    try:
        root = SafeET.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except (DefusedXmlException, SafeET.ParseError, ValueError):
        raise Rejected("The SVG couldn't be read safely (it may use DTDs or entities).") from None
    if _local(root.tag) != "svg":
        raise Rejected("The file isn't an SVG image.")
    _clean(root)
    return tostring(root, encoding="utf-8")


def _clean(el: Element) -> None:
    for child in list(el):
        if _local(child.tag) not in _ALLOWED_TAGS:
            el.remove(child)
            continue
        _clean(child)
    for attr in list(el.attrib):
        name = _local(attr).lower()
        value = el.attrib[attr]
        if name.startswith("on"):
            del el.attrib[attr]
        elif name == "href":
            if not value.strip().startswith("#"):
                del el.attrib[attr]
        elif name == "style" and (_CSS_DANGER.search(value) or _URL_IN_CSS.search(value)):
            del el.attrib[attr]
        elif _URL_IN_CSS.search(value):
            del el.attrib[attr]
    if _local(el.tag) == "style" and el.text:
        el.text = _URL_IN_CSS.sub("none", _CSS_DANGER.sub("", el.text))


def check_file(kind: str, path: str, size: int) -> Optional[bytes]:
    """Run every check for this kind. Returns cleaned bytes for SVG (store those), else None."""
    check_size(kind, size)
    if kind in ("pptx", "docx"):
        check_zip(path)
    elif kind == "pdf":
        check_pdf(path)
    elif kind in IMAGE_KINDS:
        check_image(path)
    elif kind in FONT_KINDS:
        check_font(path)
    elif kind == "svg":
        with open(path, "rb") as fh:
            return sanitize_svg(fh.read())
    return None
