"""Exports the FastAPI app's OpenAPI schema so the frontend can generate
matching TypeScript DTOs from it (see frontend/package.json's
`generate:dto` script). Run after any change to app/schemas.py or
app/eq_data.py."""

from __future__ import annotations

import json
from pathlib import Path

from app.main import app

OUT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def main() -> None:
    OUT_PATH.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
