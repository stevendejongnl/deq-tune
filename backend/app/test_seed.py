from __future__ import annotations

from sqlmodel import select

from app.models import Profile
from app.seed import iter_preset_files, load_preset, seed_factory_profiles


def test_bundled_presets_are_discoverable():
    files = list(iter_preset_files())
    assert len(files) == 14


def test_load_preset_parses_known_fields():
    files = {path.name: path for path in iter_preset_files()}
    profile = load_preset(files["tuning_preset_model_mazda_3_general.json"])

    assert profile.name == "Mazda3 — For Normal Speaker"
    assert profile.source == "factory"
    assert profile.car_model == "mazda_3"
    assert profile.speaker_type == "general"
    assert "DEQ-1000A-MZ" in profile.supported_processors
    assert profile.data["foundationEq"]["eqs"]["LR"]["numOfBand"] == 13
    assert profile.data["foundationEq"]["expandEq"]["FRONT"]["banks"]["f0"][0] == 50


def test_seed_inserts_all_bundled_profiles(session):
    inserted = seed_factory_profiles(session)
    assert inserted == 14
    assert len(session.exec(select(Profile)).all()) == 14


def test_seed_is_idempotent(session):
    seed_factory_profiles(session)
    second_pass = seed_factory_profiles(session)
    assert second_pass == 0
    assert len(session.exec(select(Profile)).all()) == 14
