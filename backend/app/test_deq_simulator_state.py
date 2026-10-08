"""Tests for the state the simulated DEQ reads."""

from __future__ import annotations

from app.deq_simulator_state import (
    DEFAULT_VOLUME_DB,
    MAXIMUM_VOLUME_DB,
    MINIMUM_VOLUME_DB,
    DeqSimulatorState,
    load_state,
)


def test_a_fresh_state_starts_from_the_volume_the_real_unit_reported():
    assert DeqSimulatorState().volume_db == DEFAULT_VOLUME_DB == -27


def test_a_state_saves_and_loads_unchanged(tmp_path):
    path = tmp_path / "state.json"
    DeqSimulatorState(volume_db=-5, muted=True, driving=True,
                      refuses_sync=True, error_flags=0x80,
                      status_by_command={"0x03": -7},
                      silent_after=[4]).save(path)
    loaded = load_state(path)
    assert loaded.volume_db == -5
    assert loaded.muted is True
    assert loaded.driving is True
    assert loaded.refuses_sync is True
    assert loaded.error_flags == 0x80
    assert loaded.status_by_command == {"0x03": -7}
    assert loaded.silent_after == [4]


def test_a_missing_file_gives_the_default_state(tmp_path):
    assert load_state(tmp_path / "absent.json") == DeqSimulatorState()


def test_an_unreadable_file_gives_the_default_state(tmp_path):
    # A scratch file a developer broke must not stop the backend starting.
    path = tmp_path / "state.json"
    path.write_text("{ this is not json")
    assert load_state(path) == DeqSimulatorState()


def test_a_field_this_version_does_not_know_is_ignored(tmp_path):
    # An older console may have written a field this build removed.
    path = tmp_path / "state.json"
    path.write_text('{"volume_db": -9, "from_a_later_version": true}')
    assert load_state(path).volume_db == -9


def test_the_volume_is_held_inside_the_range_the_unit_accepts():
    assert DeqSimulatorState(volume_db=99).clamped_volume_db == MAXIMUM_VOLUME_DB
    assert DeqSimulatorState(volume_db=-999).clamped_volume_db == MINIMUM_VOLUME_DB


def test_command_faults_come_back_as_integer_command_ids():
    state = DeqSimulatorState(status_by_command={"0x03": -7, "9": -2})
    assert state.faults_by_command_id() == {0x03: -7, 9: -2}


def test_no_fault_set_reads_as_none():
    assert DeqSimulatorState().describe_faults() == "none"


def test_each_fault_is_named_once_it_is_on():
    described = DeqSimulatorState(refuses_sync=True, error_flags=0x4).describe_faults()
    assert "refusing the open" in described
    assert "0x4" in described
