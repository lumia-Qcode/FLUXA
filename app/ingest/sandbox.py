"""Run file checks and extraction in a separate, short-lived process.

Parsers for PDF, Office, image and font files are large and see hostile input. Running
them in a child process means a parser crash, hang or memory blow-up can't take the web
server down: the child is killed at the time limit. The child gets a stripped
environment (no API keys or secrets) and never imports the Flask app or reads .env.

Windows has no per-process memory rlimit in the standard library, so memory is bounded
by the size limits and pixel/zip guards rather than by the OS.

Child protocol: argv = [kind, input_path, cleaned_output_path]; prints one JSON object:
    {"ok": true, "extract": {...}, "cleaned": bool} | {"ok": false, "rejected": "message"}
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP_DIR = os.path.join(PROJECT_ROOT, "app")
DEFAULT_TIMEOUT_S = 90
_PASS_ENV = ("SYSTEMROOT", "SYSTEMDRIVE", "PROGRAMDATA", "WINDIR", "PATH", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "LANG")


class SandboxError(Exception):
    """The child failed for a reason that isn't the file's fault (timeout, crash)."""


def run_sandboxed(kind: str, path: str, cleaned_path: str, timeout: float = DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    env = {k: os.environ[k] for k in _PASS_ENV if k in os.environ}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        proc = subprocess.run(
            [sys.executable, os.path.abspath(__file__), kind, path, cleaned_path],
            capture_output=True,
            timeout=timeout,
            env=env,
            cwd=os.path.dirname(path) or None,
        )
    except subprocess.TimeoutExpired:
        raise SandboxError("Reading the file took too long and was stopped.") from None
    lines = [ln for ln in proc.stdout.decode("utf-8", "replace").splitlines() if ln.startswith("{")]
    if not lines:
        raise SandboxError(f"The file reader stopped unexpectedly (exit {proc.returncode}).")
    return json.loads(lines[-1])


def _child(argv) -> Dict[str, Any]:
    import types

    # Load only app.ingest.*: a stub `app` package keeps app/__init__ (Flask, .env) unloaded.
    stub = types.ModuleType("app")
    stub.__path__ = [APP_DIR]
    sys.modules["app"] = stub
    sys.path.insert(0, PROJECT_ROOT)

    from app.ingest import extract as ex
    from app.ingest import guards

    kind, path, cleaned_path = argv
    try:
        cleaned = guards.check_file(kind, path, os.path.getsize(path))
        if cleaned is not None:
            with open(cleaned_path, "wb") as fh:
                fh.write(cleaned)
            path = cleaned_path
        return {"ok": True, "extract": ex.extract(path, kind), "cleaned": cleaned is not None}
    except guards.Rejected as exc:
        return {"ok": False, "rejected": str(exc)}
    except Exception as exc:  # parser blew up on this file
        return {"ok": False, "rejected": "The file couldn't be read. It may be damaged.", "detail": type(exc).__name__}


if __name__ == "__main__":
    sys.path = [p for p in sys.path if os.path.abspath(p or ".") != os.path.dirname(os.path.abspath(__file__))]
    print(json.dumps(_child(sys.argv[1:4])))
