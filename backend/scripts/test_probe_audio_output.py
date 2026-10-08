"""Checks the audio probe against the fake unit.

The probe writes to a real DEQ, so the thing worth testing is the order it
writes in and that it puts the unit back. The fake is honest about the
three state commands -- its replies are pinned to bytes the real unit sent
on 2026-10-08 -- so a rehearsal here says what a car run will do.
"""

from __future__ import annotations

from app.deq_session import DeqSession
from app.testing.fake_deq import FakeDeq
from scripts.probe_audio_output import ProbeLog, run_probe


class SilentLog(ProbeLog):
    """A log that keeps its lines instead of printing them."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def step(self, what: str) -> None:
        self.lines.append(what)

    def reply(self, what: str, detail: str) -> None:
        self.lines.append(f"{what}: {detail}")

    def note(self, what: str) -> None:
        self.lines.append(what)


def never_sleeps(seconds: float) -> None:
    """Stands in for `time.sleep`, so a test runs at full speed."""


def test_the_probe_sends_each_mode_then_play_ready_then_the_volume():
    """The order is the point: the mode first, because under THROUGH the
    unit refused the volume write."""
    fake = FakeDeq(volume_db=-37)
    session = DeqSession(fake)

    run_probe(
        session,
        SilentLog(),
        mode_wire_values=[5],
        volume_db=-20,
        hold_seconds=0,
        sleep_function=never_sleeps,
    )

    sent_after_the_reads = [
        command_id
        for command_id in fake.command_order
        if command_id in (0x0B, 0x0D, 0x1A)
    ]
    assert sent_after_the_reads == [0x0B, 0x1A, 0x0D, 0x0B, 0x0D]


def test_the_probe_puts_the_mode_and_volume_back():
    """A car session must not leave the unit in a mode nobody asked for."""
    fake = FakeDeq(volume_db=-37)
    session = DeqSession(fake)

    run_probe(
        session,
        SilentLog(),
        mode_wire_values=[5, 6],
        volume_db=-20,
        hold_seconds=0,
        sleep_function=never_sleeps,
    )

    assert fake.mode == 4
    assert fake.volume_db == -37


def test_the_probe_puts_the_unit_back_even_when_a_mode_fails():
    """The restore runs in a `finally`, so a refusal mid-probe still
    leaves the unit as it was found."""
    fake = FakeDeq(volume_db=-37, status_by_command={0x1A: -5})
    session = DeqSession(fake)

    try:
        run_probe(
            session,
            SilentLog(),
            mode_wire_values=[5],
            volume_db=-20,
            hold_seconds=0,
            sleep_function=never_sleeps,
        )
    except Exception:
        pass

    assert fake.mode == 4


def test_it_reads_the_state_without_writing_first():
    """The four reads carry no body, so they cannot change the unit."""
    fake = FakeDeq(volume_db=-37)
    session = DeqSession(fake)

    run_probe(
        session,
        SilentLog(),
        mode_wire_values=[],
        volume_db=-20,
        hold_seconds=0,
        sleep_function=never_sleeps,
    )

    reads = [one for one in fake.command_order if one in (0x0C, 0x0E, 0x10, 0x11)]
    assert reads == [0x0C, 0x0E, 0x10, 0x11]
