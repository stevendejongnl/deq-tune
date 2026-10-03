#!/usr/bin/env python3
"""Reads the DEQ's own value sets out of the Pioneer APK.

The Android app is the authority on every value the unit accepts. These
enums are not design choices, so this script copies them instead of
restating them:

    python3 tools/build_enums.py ../apktool_out

It writes `backend/app/deq_enums.json`. The decompiled APK stays in the
outer, private repo, so the generated file is committed and this script
runs again only when a new APK version arrives.

Each enum constant carries three things. Its Java name (`SUPER_BASS`), a
string id the app uses for storage (`jp.pioneer.mle.soundtune.eq.superbass`)
and an integer the protocol puts on the wire. The wire value is the one
that matters, and it is a separate constructor argument from the ordinal,
so this script reads it rather than counting positions.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Each entry is one value set the protocol carries. The comment names the
# screen or payload field it feeds.
ENUM_SOURCES = {
    "eq_style": "model/b/o$b.smali",  # EQ Style tiles
    "live_simulation": "model/b/n$a.smali",  # Live Simulation options
    "band_count": "model/b/p$b.smali",  # 13-band or 31-band
    "custom_bank": "model/b/p$c.smali",  # Custom A or Custom B
    "speaker_mode": "model/b/x.smali",  # speaker layout
    "crossover_slope": "model/b/j$b.smali",  # filter slope
    "crossover_kind": "model/b/j$c.smali",  # HPF, BPF, LPF
    "driving_state": "model/b/f.smali",  # running or not
    "mute_state": "model/b/q.smali",  # sound on or off
    "speaker_channel": "model/b/w$a.smali",  # per-speaker addressing
    "audio_source": "model/b/v.smali",  # what is feeding the unit audio
}

NEW_INSTANCE = re.compile(r"^\s*new-instance (v\d+), ")
CONST_STRING = re.compile(r"^\s*const-string (v\d+), \"(.*)\"$")
CONST_INT = re.compile(r"^\s*const(?:/4|/16|/high16)? (v\d+), (-?0x[0-9a-f]+)$")
INVOKE_INIT = re.compile(r"^\s*invoke-direct \{([^}]*)\}, \S+-><init>\(([^)]*)\)V")


def read_enum_constants(smali_text: str) -> list[dict]:
    """Walks a `<clinit>` body, tracking what each register holds.

    smali names registers rather than pushing a stack, so the argument
    order in the `<init>` call is the only thing that says which constant
    is the name, which is the wire value and which is the string id.
    """
    constants: list[dict] = []
    registers: dict[str, object] = {}
    for line in smali_text.splitlines():
        const_string_match = CONST_STRING.match(line)
        if const_string_match is not None:
            registers[const_string_match.group(1)] = const_string_match.group(2)
            continue

        const_int_match = CONST_INT.match(line)
        if const_int_match is not None:
            registers[const_int_match.group(1)] = int(const_int_match.group(2), 16)
            continue

        invoke_match = INVOKE_INIT.match(line)
        if invoke_match is None:
            continue

        argument_registers = [name.strip() for name in invoke_match.group(1).split(",")]
        constant = read_one_constant(argument_registers, invoke_match.group(2), registers)
        if constant is not None:
            constants.append(constant)
    return constants


def split_parameter_types(descriptor: str) -> list[str]:
    """Splits a JVM parameter descriptor into one entry per parameter.

    `Ljava/lang/String;IILjava/lang/String;` is four parameters, not two.
    A class type runs from `L` to the next `;`, an array adds `[` in
    front, and every other type is one letter.
    """
    types: list[str] = []
    position = 0
    while position < len(descriptor):
        start = position
        while descriptor[position] == "[":
            position += 1
        if descriptor[position] == "L":
            position = descriptor.index(";", position) + 1
        else:
            position += 1
        types.append(descriptor[start:position])
    return types


def read_one_constant(
    argument_registers: list[str],
    parameter_types: str,
    registers: dict[str, object],
) -> dict | None:
    """Maps one `<init>` call onto a name, an ordinal and a wire value.

    Every enum here starts `(String name, int ordinal, ...)`. A later
    `int` parameter is the wire value and a later `String` is the app's
    storage id. An enum with no extra parameters sends its ordinal.
    """
    types = split_parameter_types(parameter_types)
    values = [registers.get(name) for name in argument_registers[1:]]
    if len(values) < 2 or not isinstance(values[0], str):
        return None

    name = values[0]
    ordinal = values[1]
    if not isinstance(ordinal, int):
        return None

    wire_value = ordinal
    string_id = None
    for parameter_type, value in zip(types[2:], values[2:]):
        if parameter_type == "Ljava/lang/String;" and isinstance(value, str):
            string_id = value
        elif isinstance(value, int):
            wire_value = value

    constant = {"name": name, "ordinal": ordinal, "wire_value": wire_value}
    if string_id is not None and string_id != name:
        constant["string_id"] = string_id
    return constant


def build_corpus(apktool_root: Path) -> dict:
    smali_root = apktool_root / "smali_classes2" / "jp" / "pioneer" / "mle" / "soundtune"
    enums = {}
    for enum_name, relative_path in ENUM_SOURCES.items():
        smali_path = smali_root / relative_path
        if not smali_path.exists():
            raise SystemExit(f"missing {smali_path}")
        constants = read_enum_constants(smali_path.read_text())
        if constants == []:
            raise SystemExit(f"no constants found in {smali_path}")
        enums[enum_name] = {
            "apk_class": f"soundtune/{relative_path.removesuffix('.smali')}",
            "values": constants,
        }
    return {
        "version": 1,
        "description": (
            "The DEQ's own value sets, read from the Pioneer Sound & Tune APK. "
            "The app is the authority on these. Rebuild with tools/build_enums.py."
        ),
        "enums": enums,
    }


def main(arguments: list[str]) -> None:
    if len(arguments) != 1:
        raise SystemExit("usage: build_enums.py <apktool_out directory>")
    corpus = build_corpus(Path(arguments[0]).resolve())
    output_path = Path(__file__).resolve().parent.parent / "backend" / "app" / "deq_enums.json"
    output_path.write_text(json.dumps(corpus, indent=1) + "\n")
    total = sum(len(one["values"]) for one in corpus["enums"].values())
    print(f"wrote {output_path} — {len(corpus['enums'])} enums, {total} values")


if __name__ == "__main__":
    main(sys.argv[1:])
