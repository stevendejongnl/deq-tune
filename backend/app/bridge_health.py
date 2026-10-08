"""How the machine running this backend is doing.

The backend runs on the bridge: a Pi wired to the DEQ in the car. That
machine can be unwell in ways that look exactly like a broken app -- a Pi
browning out drops its USB link, its Wi-Fi, or both, and the person
holding the phone sees an app that stopped working for no reason.

So this reports the bridge's own health, separately from
`deq_device.py`'s report of the DEQ. The two fail independently and mean
different things: a DEQ that is switched off is normal, and a bridge that
is browning out is a fault in the wiring.

Undervoltage is the one worth reading today. A Pi reports it through
`vcgencmd`, which exists only on a Pi, so every other machine answers
"unknown" rather than failing. Nothing here may raise: a health report
that breaks the app it reports on is worse than no report.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

# What `vcgencmd get_throttled` returns. The low bits say what is true
# now; the high bits say it happened at some point since this boot and
# are cleared by a reboot.
UNDERVOLTAGE_NOW_FLAG = 0x1
UNDERVOLTAGE_SINCE_BOOT_FLAG = 0x10000

VCGENCMD_TIMEOUT_SECONDS = 5.0

UPTIME_PATH = "/proc/uptime"


@dataclass(frozen=True)
class BridgeHealth:
    """What the app shows about the machine holding the link."""

    # None where the machine cannot say -- a laptop has no `vcgencmd`.
    undervoltage_now: bool | None = None
    undervoltage_since_boot: bool | None = None
    uptime_seconds: float | None = None


def read_throttled_flags(run_command=subprocess.run) -> int | None:
    """Returns the Pi's throttle flags, or None where there are none.

    `run_command` is a seam: a test passes a small fake instead of a Pi.
    """
    try:
        completed = run_command(
            ["vcgencmd", "get_throttled"],
            capture_output=True,
            text=True,
            timeout=VCGENCMD_TIMEOUT_SECONDS,
        )
    except Exception:
        # No vcgencmd, no permission, or it hung. None of those are worth
        # failing a request over.
        return None
    _, _, value_text = (completed.stdout or "").strip().partition("=")
    try:
        return int(value_text, 16)
    except ValueError:
        return None


def read_uptime_seconds(uptime_path: str = UPTIME_PATH) -> float | None:
    """Returns the seconds since boot, or None where there is no procfs."""
    try:
        with open(uptime_path) as handle:
            return float(handle.read().split()[0])
    except Exception:
        return None


def read_bridge_health(run_command=subprocess.run, uptime_path: str = UPTIME_PATH):
    """Returns what this machine can say about its own health."""
    flags = read_throttled_flags(run_command)
    if flags is None:
        return BridgeHealth(uptime_seconds=read_uptime_seconds(uptime_path))
    return BridgeHealth(
        undervoltage_now=bool(flags & UNDERVOLTAGE_NOW_FLAG),
        undervoltage_since_boot=bool(flags & UNDERVOLTAGE_SINCE_BOOT_FLAG),
        uptime_seconds=read_uptime_seconds(uptime_path),
    )
