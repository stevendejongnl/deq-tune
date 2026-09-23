"""Loads the bundled Pioneer factory presets (extracted from the Sound
Tune APK's assets/TuningPreset/) into the DB as read-only profiles."""

from __future__ import annotations

import json
import os
from pathlib import Path

from sqlmodel import Session, select

from app.eq_data import TuningData
from app.models import Profile
from app.preset_translations import english_bank_name

DEFAULT_PRESETS_DIR = Path(__file__).resolve().parents[2] / "data" / "presets"
PRESETS_DIR = Path(os.environ.get("DEQ_PRESETS_DIR", DEFAULT_PRESETS_DIR))

_TUNING_DATA_FIELDS = set(TuningData.model_fields)


def _speaker_type_from_filename(path: Path) -> str | None:
    stem = path.stem
    if stem.endswith("_general"):
        return "general"
    if stem.endswith("_carrozzeria"):
        return "carrozzeria"
    return None


def iter_preset_files(presets_dir: Path = PRESETS_DIR):
    for manufacturer_dir in sorted(presets_dir.iterdir()):
        if not manufacturer_dir.is_dir():
            continue
        for path in sorted(manufacturer_dir.glob("tuning_preset_*.json")):
            yield path


def load_preset(path: Path) -> Profile:
    raw = json.loads(path.read_text(encoding="utf-8"))
    header = raw["header"]
    tuning_data = {
        field_name: field_value
        for field_name, field_value in raw.items()
        if field_name in _TUNING_DATA_FIELDS
    }
    validated = TuningData.model_validate(tuning_data)
    speaker_type = _speaker_type_from_filename(path)

    return Profile(
        name=english_bank_name(header["carModelStringsKey"], speaker_type),
        source="factory",
        brand_name=header.get("brandName"),
        car_model=header.get("carModel"),
        speaker_type=speaker_type,
        supported_processors=header.get("supportedProcessors", []),
        data=validated.model_dump(mode="json"),
    )


def seed_factory_profiles(session: Session, presets_dir: Path = PRESETS_DIR) -> int:
    """Inserts bundled presets that aren't already in the DB. Returns the
    number of profiles inserted. Safe to call on every startup."""

    existing_names = set(
        session.exec(select(Profile.name).where(Profile.source == "factory")).all()
    )

    inserted = 0
    for path in iter_preset_files(presets_dir):
        profile = load_preset(path)
        if profile.name in existing_names:
            continue
        session.add(profile)
        existing_names.add(profile.name)
        inserted += 1

    if inserted:
        session.commit()
    return inserted
