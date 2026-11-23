"""File type detection from the bytes themselves (never the file name or the browser's MIME)."""

from __future__ import annotations

import os
import re
import tempfile
import zipfile
from dataclasses import dataclass
from typing import Optional

# kind -> canonical MIME
KINDS = {
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "png": "image/png",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "ttf": "font/ttf",
    "otf": "font/otf",
    "woff": "font/woff",
    "woff2": "font/woff2",
}
IMAGE_KINDS = {"png", "jpeg", "gif", "webp"}
FONT_KINDS = {"ttf", "otf", "woff", "woff2"}
EXTENSIONS = {
    "pdf": ".pdf", "pptx": ".pptx", "docx": ".docx", "png": ".png", "jpeg": ".jpg", "gif": ".gif",
    "webp": ".webp", "svg": ".svg", "ttf": ".ttf", "otf": ".otf", "woff": ".woff", "woff2": ".woff2",
}


@dataclass(frozen=True)
class Sniffed:
    kind: Optional[str]  # None = not a supported type
    reason: str = ""

    @property
    def mime(self) -> str:
        return KINDS.get(self.kind or "", "application/octet-stream")


def sniff(head: bytes, path: Optional[str] = None) -> Sniffed:
    """Detect the type from the first bytes; zip containers are opened (read-only) to tell
    PPTX from DOCX and to refuse macro-enabled files."""
    if head.startswith(b"%PDF-"):
        return Sniffed("pdf")
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return Sniffed("png")
    if head.startswith(b"\xff\xd8\xff"):
        return Sniffed("jpeg")
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return Sniffed("gif")
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return Sniffed("webp")
    if head[:4] in (b"\x00\x01\x00\x00", b"true"):
        return Sniffed("ttf")
    if head[:4] == b"OTTO":
        return Sniffed("otf")
    if head[:4] == b"wOFF":
        return Sniffed("woff")
    if head[:4] == b"wOF2":
        return Sniffed("woff2")
    if head[:4] == b"PK\x03\x04":
        return _sniff_zip(path)
    if head[:4] == b"\xd0\xcf\x11\xe0":
        return Sniffed(None, "Old binary Office files (.ppt, .doc) aren't supported. Save as .pptx or .docx.")
    if _looks_like_svg(head):
        return Sniffed("svg")
    return Sniffed(None, "This file type isn't supported.")


def _looks_like_svg(head: bytes) -> bool:
    text = head[:4096].decode("utf-8", errors="ignore").lstrip("﻿ \t\r\n")
    if not text.startswith("<"):
        return False
    return re.search(r"<svg[\s>]", text, re.IGNORECASE) is not None


def _sniff_zip(path: Optional[str]) -> Sniffed:
    if not path:
        return Sniffed(None, "Zip-based file needs to be checked from disk.")
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            ctypes = zf.read("[Content_Types].xml").decode("utf-8", "ignore") if "[Content_Types].xml" in names else ""
    except (zipfile.BadZipFile, KeyError, OSError):
        return Sniffed(None, "The file is damaged or isn't a valid Office document.")
    if any(n.lower().endswith("vbaproject.bin") for n in names) or "macroEnabled" in ctypes:
        return Sniffed(None, "Files with macros (.pptm, .docm) aren't accepted. Save without macros.")
    if "ppt/presentation.xml" in names:
        return Sniffed("pptx")
    if "word/document.xml" in names:
        return Sniffed("docx")
    return Sniffed(None, "Zip archives aren't supported. Upload the files inside instead.")


def sniff_bytes(data: bytes) -> Sniffed:
    """Convenience for in-memory checks (tests, small files); zips are opened from memory."""
    if data[:4] == b"PK\x03\x04":
        fd, tmp = tempfile.mkstemp(suffix=".zip")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            return sniff(data[:64], tmp)
        finally:
            os.unlink(tmp)
    return sniff(data[:8192])
