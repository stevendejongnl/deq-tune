#!/usr/bin/env python3
"""Turns a capture run into `conformance/flows.json`.

The capture itself needs a rooted Android device with the Pioneer Sound &
Tune app and Frida, so it cannot run in CI. This script is the step after it:

    frida -U -p <pid> -l tools/capture_conformance.js \\
        -q -e 'setTimeout(function(){},1)' | grep '^{' > /tmp/flows.ndjson
    python3 tools/build_conformance.py /tmp/flows.ndjson

Frame flows are not captured from the app's code. The app's packer takes a
request object, so driving it needs far more of the app's internals than
replaying a captured frame does. Those four flows come from real traffic
between the app and a physical DEQ-S1000A2 instead, and are held here.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

CORPUS_PATH = Path(__file__).resolve().parent.parent / "conformance" / "flows.json"

# Four frames from traffic between the app and a physical DEQ-S1000A2.
#
# The two volume frames are a matched pair: the same command id and the same
# transaction id (0x3c), so a reply builder can be checked against them end
# to end. The two status frames are not a pair. Their transaction ids are
# 0x3a and 0x3b, because the unit never answered the first keepalive and the
# app sent it again. Each frame is still a valid frame, so each is worth
# checking on its own, but do not expect one to be the other's reply.
#
# Command 0x0d is VOLUME, per `deq_commands.json`. These two were named
# "driving-state" at first, which was wrong; driving state is command 0x04.
CAPTURED_FRAMES = {
    "frame-status-request":
        "f000400600000001000100000002000000080000000000000"
        "30a0000000000000000000000000000f7",
    "frame-status-reply":
        "f0004006000000010002000000020000000c0000000000000"
        "30b00000000000000000000000000000000000000000000f7",
    "frame-volume-request":
        "f00040060000000100010000000d0000000c000000000000030c"
        "00000000000000000000000000000f020f0f0f0f0f0ff7",
    "frame-volume-reply":
        "f00040060000000100020000000d00000100000000000000030c"
        "000000000000000000000000000000000000000000000f020f0f0f0f0f0ff7",
}


def unpack_frame(frame: bytes) -> bytes:
    header_a_length = 3 if frame[1] == 0 else 1
    start = 1 + header_a_length + 4
    count = (len(frame) - start - 1) // 2
    return bytes(
        ((frame[start + index * 2] & 0xF) << 4) | (frame[start + index * 2 + 1] & 0xF)
        for index in range(count)
    )


def frame_flows() -> list[dict]:
    flows = []
    for name, hexed in CAPTURED_FRAMES.items():
        payload = unpack_frame(bytes.fromhex(hexed))
        flows.append({
            "name": name,
            "kind": "frame",
            "oracle": "device-capture",
            "input": {
                "direction": int.from_bytes(payload[0:2], "little"),
                "commandId": int.from_bytes(payload[2:4], "little"),
                "transactionIdHex": payload[8:16].hex(),
                "bodyHex": payload[16:].hex(),
            },
            "bytesHex": hexed,
        })
    return flows


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    captured = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]

    disagreed = [flow["name"] for flow in captured if flow.get("appAgrees") is False]
    if disagreed:
        print(f"the app did not reproduce these blobs: {disagreed}", file=sys.stderr)
        return 1

    corpus = {
        "version": 1,
        "description": (
            "Every flow the DEQ needs, with the exact bytes the Pioneer Sound "
            "& Tune app produces for it. The app is the oracle; deq-tune is "
            "the thing under test. Rebuild with tools/build_conformance.py."
        ),
        "flows": frame_flows() + captured,
    }
    CORPUS_PATH.write_text(json.dumps(corpus, indent=1) + "\n")
    print(f"{len(corpus['flows'])} flows -> {CORPUS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
