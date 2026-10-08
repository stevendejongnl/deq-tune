#!/usr/bin/env python3
"""Asks a real DEQ to play the audio this device writes.

One question is open about the hardware: the DEQ takes the car's audio as
soon as a device offers a USB audio function, and nothing tried so far has
made it play what arrives on that function. A car session on 2026-10-08
ruled out source modes 0 to 4, every volume between -15 and 0, both mute
values, and a 440 Hz tone that ALSA confirmed the unit was consuming.

The APK says why that was the wrong half of the table. `SourceMode` has
ten values, and `service/g` switches the unit to `SP_OTHER_SOURCE` or
`MIX_OTHER_SOURCE` -- wire 5 and 6 -- when the phone itself starts to
play. Wire 4, THROUGH, is the car's own source, and every car test ran
under it. Wire 5 to 8 have never reached a unit.

This script sends them, one at a time, and gives a person time to listen.

    cd backend
    DEQ_TRANSPORT=accessory PYTHONPATH=. uv run python \\
        scripts/probe_audio_output.py

Run it on the Pi, where the gadget holds the link. Feed audio first: set
`FEED_AUDIO = True` and `AUDIO_FEED_TONE_HZ = 440` in
`pi-gadget/deq_accessory.py`, deploy, and start the gadget. Without a tone
there is nothing for the unit to play and every mode sounds the same.

**It writes to the unit.** Each step sends a source mode, a PLAY_READY
notification and a volume, then puts the mode and the volume it found back
when it finishes -- including after a Ctrl-C. Nothing it sends is outside
what the real app sends in its own cold start.

Rehearse it against the fake unit before the car, where it costs nothing:

    DEQ_TRANSPORT=fake PYTHONPATH=. uv run python \\
        scripts/probe_audio_output.py --hold-seconds 0
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from app.deq_device import (
    ACCESSORY_TRANSPORT_NAME,
    DeviceUnavailable,
    build_transport,
)
from app.deq_session import DeqSession
from app.deq_enums import AUDIO_SOURCE
from app.deq_transport import TransportError

# The modes to try, in the order the APK makes most likely. 5 and 6 are
# what the app itself sends when the phone plays; 7 and 8 are the PURE
# pair, which no code path in the app was seen to send.
DEFAULT_MODE_WIRE_VALUES = (5, 6, 7, 8)

# How long each mode stays on, so a person can hear whether it worked.
DEFAULT_HOLD_SECONDS = 8.0

# The volume to ask for while a mode is held. The unit sat at -37 dB
# through the whole car session, which is near the bottom of its range, so
# a tone at that level may be inaudible whatever the mode says. It refused
# this write with STATUS -6 under THROUGH; whether it refuses under an
# OTHER mode too is part of what this measures.
DEFAULT_VOLUME_DB = -20


class ProbeLog:
    """Prints what the unit answered, one line per step.

    It records nothing and decides nothing; you call `step`, `reply` or
    `note`; it depends on a print and on nothing else.
    """

    def step(self, what: str) -> None:
        print(f"\n{what}")

    def reply(self, what: str, detail: str) -> None:
        print(f"  {what:28s} {detail}")

    def note(self, what: str) -> None:
        print(f"  {what}")


def mode_name(wire_value: int) -> str:
    """Returns the APK's name for a source mode, or a plain number."""
    for value in AUDIO_SOURCE.values:
        if value.wire_value == wire_value:
            return value.name
    return f"wire {wire_value}"


def read_state(session: DeqSession, log: ProbeLog) -> dict[str, int]:
    """Reads the unit's mode, volume, mute state and driving state.

    All four are reads with an empty body -- 0x0c, 0x0e, 0x10 and 0x11 --
    so this changes nothing on the unit.
    """
    state = {
        "mode": session.read_mode(),
        "volume_db": session.read_volume(),
        "mute_state": session.read_mute_state(),
        "driving_state": session.read_driving_state(),
    }
    log.reply("mode", f"{state['mode']} ({mode_name(state['mode'])})")
    log.reply("volume", f"{state['volume_db']} dB")
    log.reply("mute state", str(state["mute_state"]))
    log.reply("driving state", str(state["driving_state"]))
    return state


def hold_one_mode(
    session: DeqSession,
    log: ProbeLog,
    wire_value: int,
    volume_db: int,
    hold_seconds: float,
    sleep_function=time.sleep,
) -> None:
    """Sets one source mode, asks for a volume, and waits.

    The order matters. The mode goes first, because under THROUGH the unit
    refused the volume write; whether an OTHER mode accepts it is the
    thing to find out. PLAY_READY follows, because the app sends it last
    in its own cold start.
    """
    log.step(f"mode {wire_value} ({mode_name(wire_value)})")
    reply = session.exchange(0x0B, wire_value.to_bytes(4, "little", signed=True))
    log.reply("0x0b SET_MODE", describe_status(reply.body))

    session.notify_play_ready()
    log.reply("0x1a PLAY_READY", "accepted")

    volume_reply = session.exchange(
        0x0D, volume_db.to_bytes(4, "little", signed=True)
    )
    log.reply(f"0x0d SET_VOLUME {volume_db}", describe_status(volume_reply.body))

    read_state(session, log)
    if hold_seconds > 0:
        log.note(f"listen now -- holding this mode for {hold_seconds:.0f}s")
        sleep_function(hold_seconds)


def describe_status(body: bytes) -> str:
    """Returns a reply's STATUS and the field that follows it, if any."""
    if len(body) < 4:
        return "no STATUS in the reply"
    status = int.from_bytes(body[0:4], "little", signed=True)
    if len(body) < 8:
        return f"STATUS {status}"
    first_field = int.from_bytes(body[4:8], "little", signed=True)
    return f"STATUS {status}, reported {first_field}"


def restore_state(
    session: DeqSession, log: ProbeLog, state: dict[str, int]
) -> None:
    """Puts back the mode and volume the unit held before the probe."""
    log.step("putting the unit back")
    mode_reply = session.exchange(
        0x0B, state["mode"].to_bytes(4, "little", signed=True)
    )
    log.reply(
        f"mode {state['mode']} ({mode_name(state['mode'])})",
        describe_status(mode_reply.body),
    )
    volume_reply = session.exchange(
        0x0D, state["volume_db"].to_bytes(4, "little", signed=True)
    )
    log.reply(f"volume {state['volume_db']} dB", describe_status(volume_reply.body))


def run_probe(
    session: DeqSession,
    log: ProbeLog,
    mode_wire_values=DEFAULT_MODE_WIRE_VALUES,
    volume_db: int = DEFAULT_VOLUME_DB,
    hold_seconds: float = DEFAULT_HOLD_SECONDS,
    sleep_function=time.sleep,
) -> dict[str, int]:
    """Runs the whole probe and returns the state it found at the start.

    The session is a parameter, so a test passes a fake unit through it and
    a car run passes the real link.
    """
    log.step("the unit's state before anything is sent")
    state_before = read_state(session, log)

    try:
        for wire_value in mode_wire_values:
            hold_one_mode(
                session,
                log,
                wire_value,
                volume_db,
                hold_seconds,
                sleep_function=sleep_function,
            )
    finally:
        restore_state(session, log, state_before)
    return state_before


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--modes",
        default=",".join(str(one) for one in DEFAULT_MODE_WIRE_VALUES),
        help="source mode wire values to try, comma separated",
    )
    parser.add_argument(
        "--volume-db",
        type=int,
        default=DEFAULT_VOLUME_DB,
        help="volume to ask for while each mode is held",
    )
    parser.add_argument(
        "--hold-seconds",
        type=float,
        default=DEFAULT_HOLD_SECONDS,
        help="how long to hold each mode, so a person can listen",
    )
    return parser.parse_args(arguments)


def main(arguments: list[str]) -> int:
    options = parse_arguments(arguments)
    transport_name = os.environ.get("DEQ_TRANSPORT", ACCESSORY_TRANSPORT_NAME)
    print(f"Opening the link ({transport_name})")
    try:
        transport = build_transport(transport_name)
    except (DeviceUnavailable, TransportError) as caught_error:
        print(f"no link: {caught_error}")
        return 1

    session = DeqSession(transport)
    try:
        session.start()
        run_probe(
            session,
            ProbeLog(),
            mode_wire_values=[int(one) for one in options.modes.split(",")],
            volume_db=options.volume_db,
            hold_seconds=options.hold_seconds,
        )
    except Exception as caught_error:
        print(f"\nthe probe stopped: {caught_error}")
        return 1
    finally:
        session.close()

    print("\nDone. Which mode, if any, was audible is the answer this was for.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
