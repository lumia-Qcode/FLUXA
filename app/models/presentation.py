from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class Presentation:
    id: Optional[int]
    title: str
    description: Optional[str]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    theme: Optional[dict[str, Any]] = None
    datasets: Optional[dict[str, Any]] = None
    variables: Optional[dict[str, Any]] = None
    settings: Optional[dict[str, Any]] = None
    schema_version: int = 1
    revision: int = 1
    share_token: Optional[str] = None
    is_shared: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "theme": self.theme or {"themeId": "default"},
            "datasets": self.datasets or {},
            "variables": self.variables or {},
            "settings": self.settings
            or {"transition": {"effect": "fade", "duration": 300}, "loop": False},
            "schema_version": self.schema_version,
            "revision": self.revision,
            "share_token": self.share_token,
            "is_shared": self.is_shared,
        }


@dataclass
class Slide:
    id: Optional[int]
    presentation_id: int
    slide_order: int
    title: Optional[str]
    content: Optional[str]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    spec: Optional[dict[str, Any]] = None

    def to_dict(self):
        return {
            "id": self.id,
            "presentation_id": self.presentation_id,
            "slide_order": self.slide_order,
            "title": self.title,
            "content": self.content,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "spec": self.spec,
        }
