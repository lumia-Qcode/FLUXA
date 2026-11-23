"""Shared test setup.

Tests never call a real model or the network (AGENTS.md). The developer's .env selects a
real provider (AI_PROVIDER=openrouter), and the generation routes try that provider before
the mocked prompt service, so without this guard the suite made live requests: slow
(minutes per test) and non-deterministic.

The API needs a signed-in user (app/auth.py). Tests written before accounts existed get a
client that signs up a test admin on its first request; auth tests use `anon_client`.
"""

import os

import pytest
import requests

# Tests run jobs explicitly (app.jobs.worker.run_one); no background worker threads.
os.environ["JOBS_WORKER"] = "0"
from flask import Flask
from flask.testing import FlaskClient

from app.config import Config

TEST_EMAIL = "tester@example.com"
TEST_PASSWORD = "correct-horse-battery"


class SignedInClient(FlaskClient):
    """Signs up (or signs in) a test admin before its first API call."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._signed_in = False

    def open(self, *args, **kwargs):
        path = args[0] if args and isinstance(args[0], str) else kwargs.get("path", "")
        if not self._signed_in and not str(path).startswith("/api/auth/"):
            self._signed_in = True
            resp = super().open("/api/auth/signup", method="POST", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
            if resp.status_code == 409:
                super().open("/api/auth/login", method="POST", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        return super().open(*args, **kwargs)


@pytest.fixture(autouse=True)
def _no_real_ai_or_network(monkeypatch):
    monkeypatch.setattr(Config, "AI_PROVIDER", "mock")

    def _blocked(self, method, url, *args, **kwargs):
        raise RuntimeError(f"Network access is disabled in tests ({method} {url}). Mock it instead.")

    monkeypatch.setattr(requests.Session, "request", _blocked)


@pytest.fixture(autouse=True)
def _signed_in_test_clients(request, monkeypatch):
    if "anon_client_class" not in request.fixturenames:
        monkeypatch.setattr(Flask, "test_client_class", SignedInClient)


@pytest.fixture
def anon_client_class():
    """Opt out of the automatic sign-in (for tests of auth itself)."""
    return FlaskClient
