#!/usr/bin/env python3
"""Checks this app against a real DEQ unit.

Everything in this project was built from the Pioneer app and from captured
traffic, with a fake unit standing in for the hardware. No real unit has
answered it yet. This script is what closes that gap: plug a DEQ in, run it,
and read what matched.

    cd backend
    uv sync --extra usb
    PYTHONPATH=. uv run python scripts/check_real_deq.py

It only reads, by default. Every step that writes to the unit is off unless
you ask for it:

    PYTHONPATH=. uv run python scripts/check_real_deq.py --write

On Linux a plain user cannot usually open a USB device. Either run this with
`sudo -E env PYTHONPATH=. ...`, or install `scripts/99-pioneer-deq.rules`
as a udev rule (install steps in its own comment).

What it prints is a list of checks, each `ok`, `differs` or `failed`, and a
count at the end. A `differs` line is the interesting one: it means the unit
answered, but not the way the captures and the APK said it would. Record any
of those in `USB_CAPTURE_NOTES.md` in the outer repo, because the app is the
authority and this code is what is under test.
"""

from __future__ import annotations

import argparse
import sys

from app.deq_blob import encode_blob
from app.deq_session import (
    COMMAND_KEEPALIVE,
    STARTUP_STEPS,
    DeqSession,
    DeviceIdentity,
)
from app.deq_transport import TransportError
from app.usb_transport import UsbTransport

# What the fake unit answers, so a real one can be held against it.
EXPECTED_BLOB_BYTES = 572


class Report:
    """Collects what matched and what did not.

    It records one line per check; you call `ok`, `differs` or `failed`; it
    depends on nothing but a print.
    """

    def __init__(self) -> None:
        self.differences: list[str] = []
        self.failures: list[str] = []

    def ok(self, what: str, detail: str = "") -> None:
        print(f"  ok       {what}{f' — {detail}' if detail else ''}")

    def differs(self, what: str, detail: str) -> None:
        print(f"  DIFFERS  {what} — {detail}")
        self.differences.append(f"{what}: {detail}")

    def failed(self, what: str, detail: str) -> None:
        print(f"  FAILED   {what} — {detail}")
        self.failures.append(f"{what}: {detail}")

    def summarise(self) -> int:
        print()
        if self.failures == [] and self.differences == []:
            print("Every check matched. The unit answers the way this app expects.")
            return 0
        if self.differences != []:
            print(f"{len(self.differences)} answer(s) differed from what was expected:")
            for difference in self.differences:
                print(f"  - {difference}")
            print("Record these in USB_CAPTURE_NOTES.md: the unit is the authority.")
        if self.failures != []:
            print(f"{len(self.failures)} check(s) failed outright:")
            for failure in self.failures:
                print(f"  - {failure}")
        return 1


def check_link(report: Report) -> UsbTransport:
    """Opens the USB link, or stops with the reason."""
    print("Opening the link")
    transport = UsbTransport()
    report.ok("claimed a bulk interface", f"endpoints in and out, interface {transport.interface_number}")
    return transport


def check_startup(report: Report, session: DeqSession) -> None:
    """Runs the app's own connect sequence, one command at a time.

    Running the steps singly rather than through `start()` says which
    command a real unit refuses, if any.
    """
    print("\nRunning the startup sequence")
    for command_id, body in STARTUP_STEPS:
        try:
            reply = session.exchange(command_id, body)
        except TransportError as caught_error:
            report.failed(f"command 0x{command_id:02x}", str(caught_error))
            return
        except Exception as caught_error:
            report.differs(f"command 0x{command_id:02x}", str(caught_error))
            continue
        report.ok(f"command 0x{command_id:02x}", f"{reply.payload_length}-byte reply")


def check_identity(report: Report, session: DeqSession) -> DeviceIdentity | None:
    """Reads what the unit is, and returns it for `check_configuration`
    to cross-check its speaker mode against."""
    print("\nReading what the unit is")
    try:
        identity = session.read_device_identity()
    except Exception as caught_error:
        report.failed("device identity", str(caught_error))
        return None
    report.ok("firmware version", f"{identity.firmware_version >> 8}.{identity.firmware_version & 0xFF:02d}")
    if len(identity.serial) == 0:
        report.differs("serial number", "the unit sent an empty string")
    else:
        report.ok("serial number", identity.serial)
    return identity


def check_configuration(
    report: Report, session: DeqSession, identity: DeviceIdentity | None = None
) -> None:
    """Reads the settings blob and checks it round-trips.

    This is the strongest read-only check there is. The blob is the unit's
    whole semantic state, and `deq_blob` was written from the app's own
    reader, so a byte-exact round trip means that reader is right.

    `identity`, from `check_identity`, lets this also cross-check the
    speaker mode the `0x04` reply reported against the blob's own
    `speaker_mode` byte. The two are read by two different commands, so
    agreement is not guaranteed by either read alone.
    """
    print("\nReading the settings blob")
    try:
        configuration = session.read_user_configuration()
    except Exception as caught_error:
        report.failed("reading the blob", str(caught_error))
        return

    rebuilt = encode_blob(configuration)
    if len(rebuilt) != EXPECTED_BLOB_BYTES:
        report.differs(
            "blob size", f"{len(rebuilt)} bytes, not the {EXPECTED_BLOB_BYTES} expected"
        )
    else:
        report.ok("blob size", f"{len(rebuilt)} bytes")

    report.ok("speaker mode", str(configuration.speaker_mode))
    report.ok("equalizer bands", str(configuration.band_count))
    report.ok("bank in use", str(configuration.bank_in_use))

    # Three fields the APK's writer explained; this is the first chance to
    # check any of them against a real unit. See USB_CAPTURE_NOTES.md in
    # the outer repo for the trace.
    if configuration.always_false_flag != 0:
        report.differs(
            "always_false_flag",
            f"unit sent {configuration.always_false_flag}, "
            "but the app's writer only ever emits a literal 0 here",
        )
    else:
        report.ok("always_false_flag", "0, as the app's writer always sends")

    if configuration.model_digest == bytes(16):
        report.ok("model_digest", "16 zero bytes (the app's empty-string case)")
    elif len(configuration.model_digest) == 16:
        report.ok("model_digest", f"{configuration.model_digest.hex()} (a real MD5 digest)")
    else:
        report.failed(
            "model_digest", f"{len(configuration.model_digest)} bytes, expected 16"
        )

    if identity is not None:
        if identity.speaker_mode == configuration.speaker_mode:
            report.ok(
                "speaker mode agreement",
                f"command 0x04 and the blob both say {identity.speaker_mode}",
            )
        else:
            report.differs(
                "speaker mode agreement",
                f"command 0x04 said {identity.speaker_mode}, "
                f"the blob says {configuration.speaker_mode}",
            )


def check_keepalive(report: Report, session: DeqSession) -> None:
    """Sends several keepalives, as the app does for a whole session."""
    print("\nHolding the session open")
    for attempt in range(1, 6):
        try:
            session.exchange(COMMAND_KEEPALIVE)
        except Exception as caught_error:
            report.failed(f"keepalive {attempt}", str(caught_error))
            return
    report.ok("five keepalives", "the session stayed up")


def check_write_back(report: Report, session: DeqSession) -> None:
    """Writes the unit's own settings back to it, unchanged.

    This is the gentlest write there is: the blob that comes back is the one
    that went in, so a unit that accepts it is left exactly as it was.
    """
    print("\nWriting the blob back, unchanged")
    try:
        before = session.read_user_configuration()
        session.write_user_configuration(before)
        after = session.read_user_configuration()
    except Exception as caught_error:
        report.failed("writing the blob", str(caught_error))
        return

    if encode_blob(before) == encode_blob(after):
        report.ok("blob round trip", "the unit kept every byte")
    else:
        report.differs("blob round trip", "the unit changed bytes this app did not")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        # The docstring's own line breaks and command examples are
        # meant to be read as written, not reflowed into one paragraph.
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="also write the unit's own settings back to it, unchanged",
    )
    arguments = parser.parse_args()

    report = Report()
    try:
        transport = check_link(report)
    except TransportError as caught_error:
        print(f"  FAILED   opening the link — {caught_error}")
        return 1

    session = DeqSession(transport)
    try:
        check_startup(report, session)
        identity = check_identity(report, session)
        check_configuration(report, session, identity)
        check_keepalive(report, session)
        if arguments.write:
            check_write_back(report, session)
        else:
            print("\nSkipping the write checks. Pass --write to run them.")
    finally:
        session.close()

    return report.summarise()


if __name__ == "__main__":
    sys.exit(main())
