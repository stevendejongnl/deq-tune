"""Checks the hardware validation script, without hardware.

`scripts/check_real_deq.py` only ever runs when someone plugs a DEQ in, so
nothing else would catch it breaking. Running its checks against the fake
unit keeps it honest: the fake answers the way the captures say a real unit
does, so every check should pass against it.
"""

from __future__ import annotations

import pytest

from app.deq_session import DeqSession
from app.testing.fake_deq import FakeDeq

check_real_deq = pytest.importorskip("scripts.check_real_deq")


def run_every_check() -> check_real_deq.Report:
    report = check_real_deq.Report()
    session = DeqSession(FakeDeq())
    check_real_deq.check_startup(report, session)
    check_real_deq.check_identity(report, session)
    check_real_deq.check_configuration(report, session)
    check_real_deq.check_keepalive(report, session)
    check_real_deq.check_write_back(report, session)
    return report


def test_every_check_passes_against_the_fake_unit(capsys) -> None:
    report = run_every_check()
    capsys.readouterr()
    assert report.failures == []
    assert report.differences == []


def test_the_report_says_so_when_nothing_differed(capsys) -> None:
    report = run_every_check()
    assert report.summarise() == 0
    assert "Every check matched" in capsys.readouterr().out


def test_a_difference_is_reported_and_changes_the_exit_code(capsys) -> None:
    report = check_real_deq.Report()
    report.differs("blob size", "600 bytes, not the 572 expected")
    assert report.summarise() == 1
    output = capsys.readouterr().out
    assert "DIFFERS" in output
    assert "USB_CAPTURE_NOTES.md" in output


def test_a_failure_changes_the_exit_code(capsys) -> None:
    report = check_real_deq.Report()
    report.failed("command 0x09", "the unit sent nothing")
    assert report.summarise() == 1
    assert "failed outright" in capsys.readouterr().out
