import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.spec.models import DeckModel, SlideModel  # noqa: E402

schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "FLUXA Presentation Specification",
    "definitions": {
        "Deck": DeckModel.model_json_schema(),
        "Slide": SlideModel.model_json_schema(),
    },
}

with open("shared/spec.schema.json", "w", encoding="utf-8") as f:
    json.dump(schema, f, indent=2)

print("Generated shared/spec.schema.json successfully!")
