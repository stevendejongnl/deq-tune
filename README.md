# DEQ Tune

A web app for the equalizer and sound-profile part of Pioneer's Sound & Tune app.

This app edits DEQ tuning profiles: the 13-band graphic EQ, per-speaker level and time alignment, the high-pass filter, and fader/balance. It ships with the factory Mazda presets, extracted from the official Android app, and the device's built-in EQ-style and Live-Simulation DSP presets (Powerful, Super Bass, Concert hall, ...). The UI works in English, Japanese, German, French, Spanish, and Dutch, auto-detected from the browser. The profile list is a permanent sidebar on a desktop screen, a drawer on a tablet, and a bottom sheet on a phone. You can edit a factory preset directly, then revert it or save it as your own profile. It's also a PWA — installable, with an offline app shell. The backend speaks the DEQ's USB protocol and drives the unit; the USB transport itself is the last piece missing (see [Status](#status)).

## Project layout

```
backend/    FastAPI + SQLite. Serves and stores profiles, and drives the DEQ unit.
frontend/   Lit + TypeScript + Vite. The EQ editor, profile list, and device header. Also a PWA.
            `e2e/` holds the Playwright tests, which drive a real browser.
            `src/i18n/locales/` holds the UI text, one JSON file per language.
data/presets/  The bundled factory preset JSON files, extracted from the Pioneer APK.
openapi.json   The backend's exported API schema. The frontend generates its DTOs from this file.
conformance/   Shared test corpus: inputs plus the exact bytes the Pioneer app produces for them.
tools/         Builds the conformance corpus and the device's value sets from the Pioneer APK.
Makefile       Shortcuts for install/dev/test/generate-dto/clean. Run `make help`.
```


## Setup

You need Python 3.13+ with [`uv`](https://docs.astral.sh/uv/), Node.js 22+, and a Go toolchain (`go` on your `PATH`) — the frontend's `typia` transform compiles a small native plugin on first install.

```bash
cd backend && uv sync
cd ../frontend && npm install
```

`npm install` also runs a one-time native build for the frontend's DTO-validation toolchain. On a fresh install this takes one to three minutes; let it finish.

`make install` then runs `make warm`, which fills the frontend's dependency cache. Without it the first page load stalls: the `ttsc` transform writes imports of `typia`'s deep internals, so Vite cannot see them when it first scans, and it discovers them mid-load, re-optimizes and reloads. Warming takes about a second and makes `make dev` start in well under a second. Run `make warm` again after a `typia` or `vite` version change.

## Makefile

A `Makefile` at the repo root wraps the commands below. Run `make` or `make help` to list targets.

```bash
make install        # install backend and frontend dependencies
make dev             # run backend (8420) and frontend (5173) dev servers together
make test            # run backend and frontend tests
make e2e             # run the end-to-end tests in a real browser
make e2e-install     # install the browser those tests need, once
make typecheck       # type-check the frontend
make generate-dto    # regenerate frontend DTOs from the backend schema
make clean           # remove .venv, node_modules, and the local database
```

## Run it locally

Either `make dev`, or run each side by hand:

Start the backend (port 8420):

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.main:app --reload --port 8420
```

Start the frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. The backend seeds its 14 bundled Mazda factory profiles into `backend/deq.db` on first startup.

## Tests

Either `make test`, or run each side by hand:

```bash
cd backend && uv run pytest
cd frontend && npm test
```

Every test file lives next to the code it tests (`app/foo.py` → `app/test_foo.py`, `src/foo.ts` → `src/foo.test.ts`).

The end-to-end tests run in a real browser, which is the only place real
rendering and real CSS can be checked. They start the backend and the
frontend themselves, with `DEQ_TRANSPORT=fake`, so they need no hardware:

```bash
make e2e-install    # once, to fetch Chromium
make e2e
```

Those specs live in `frontend/e2e/` and end in `.spec.ts`, so `vitest` and
Playwright never pick up each other's files.

## Translating

The app's text lives in `frontend/src/i18n/locales/`, one JSON file per
language. `en.json` is the source text and changes with the code. The other
five are translated by the community at
<https://hosted.weblate.org/projects/deq-tune/>, which opens a pull request on this repository for every batch of
changes.

A string nobody translated yet reads English, so a part-done language still
works. [TRANSLATING.md](TRANSLATING.md) explains how to help, and which names
are deliberately **not** translatable: the EQ-style, Live-Simulation, car model,
and speaker-type names are copied from Pioneer's own app so the web UI matches
what the DEQ unit shows.


## Regenerating the frontend DTOs

The backend's Pydantic models are the source of truth for the data shape. After changing `backend/app/eq_data.py` or `backend/app/schemas.py`, run `make generate-dto`, or by hand:

```bash
cd backend && PYTHONPATH=. uv run python scripts/export_openapi.py
cd ../frontend && npm run generate:dto
```

Commit the updated `openapi.json` and `frontend/src/dto/generated/openapi.d.ts` together with the schema change. The frontend's API client validates every request and response against these generated types at runtime (`typia.assert`), so a mismatch fails loudly instead of silently.

## Licence

[GNU AGPL-3.0](LICENSE).

**Scope.** The licence covers this project's own code. It does not cover the
material taken from Pioneer's Android app: the bundled preset files in
`data/presets/`, and the car model, speaker type, EQ-style and Live-Simulation
names transcribed in `backend/app/preset_translations.py`,
`frontend/src/i18n/preset-names.ts`, and `frontend/src/i18n/dsp-presets.ts`.
Those stay Pioneer's, and they are here so this app can talk to the same device
and show the same names on screen. This project is not made by, or connected
to, Pioneer.

## Status

- **Profile editing** — works. Factory Mazda presets plus your own custom profiles, backed by the FastAPI backend.
- **Localization** — works. English, Japanese, German, French, Spanish, and Dutch, auto-detected from the browser on first visit and remembered after. The UI text lives in `frontend/src/i18n/locales/`, one JSON file per language, translated by the community in Weblate (see [TRANSLATING.md](TRANSLATING.md)). Preset and DSP-preset names are copied from the APK's own string resources per locale (`backend/app/preset_translations.py`, `frontend/src/i18n/preset-names.ts`, `frontend/src/i18n/dsp-presets.ts`) — the bundled preset JSON itself only carries Japanese display text. Note: Pioneer never localized the car/speaker-type names for German/French/Spanish/Dutch, so those show the same English text there; the EQ-style and Live-Simulation DSP preset names are genuinely translated in all six locales.
- **EQ Style / Live Simulation** — works, against a connected unit. These are the DEQ hardware's own built-in DSP presets (Powerful, Super Bass, Concert hall, ...), which the unit runs itself. Neither has a command of its own: both live in the settings blob, as `preset_index_a` and `sound_field`, so selecting one reads the blob, changes that byte and writes it back. The lists come from the Pioneer app's own enums — 21 EQ styles and 8 live-simulation modes — read out of the APK by `tools/build_enums.py` into `backend/app/deq_enums.json`. An earlier version of this app had 8 and 5, chosen before the protocol was decoded.
- **Browsers** — all of them. The backend owns the USB link, so the frontend needs no WebUSB and the app has no browser requirement. It once blocked Safari, Firefox and iOS for a capability it no longer uses.
- **DSP coefficients** — works. `backend/app/deq_dsp.py` computes the numbers the DEQ expects: the 13-band equalizer, the crossover filters, and the time alignment. The DEQ designs no filters of its own; the Android app sends finished coefficients, so this app has to produce the same ones. The maths is checked against coefficients captured from the Android app's own designer library (`backend/app/deq_dsp_reference.json`, 253 cases) and matches to within one Q27 step. The equalizer needs one step beyond filter design: the library spreads every band's gain over the other bands before it designs a biquad, so two raised bands are not two independent peakers. `fit_equalizer_gains` reproduces that step from the library's own constant tables. `conformance/flows.json` then checks whole payloads, byte for byte, against what the Android app produces (`backend/app/test_conformance.py`).
- **Driving the unit** — works, apart from the wire. `backend/app/deq_session.py` runs the unit's own startup sequence, matches every reply to its request, and sends a profile's DSP settings as the three blocks of command `0x05` the unit wants: the equalizer under CONFIG_ID 13, the time alignment under 10, and the crossover under 11 or 12. Each of those CONFIG_IDs comes from the APK's own dispatch table, and each payload size matches the field width that table declares. `backend/app/deq_protocol.py` reads and writes the wire format, and `backend/app/deq_commands.json` lists every command's fields in both directions, generated from the Android app's field enums. `backend/app/deq_blob.py` reads and writes the settings blob — speaker mode, both equalizer banks, crossovers, per-speaker values.

  The frontend asks for all of this over `/api/device`, so the browser never touches USB.

  `/api/bridge` reports the machine the backend runs on, which is not the DEQ. A Pi that browns out drops its USB link and its Wi-Fi at once, so without this the app shows only the symptom and a person debugs the wrong thing. It reads the Pi's undervoltage flags through `vcgencmd`, and answers `null` on any machine that has none, so a laptop and CI are not special cases.

  A fault there is recorded as a **notice that stays until the bridge restarts** (`backend/app/bridge_notices.py`). A dip lasting a second is gone from every live reading by the time anyone looks, and it still explains the link that dropped, so clearing it when the condition passes would hide the only evidence. Restarting the bridge clears them, which matches the hardware's own sticky undervoltage bit.

  The backend connects by itself. `LinkKeeper` in `backend/app/deq_device.py` runs in its own thread, started with the app, and calls `connect()` until the link is up and again whenever it drops. So the frontend has no connect button: it reads `/api/device` and reports what it finds. A thread and not an asyncio task, because a transport read blocks for its whole timeout and would otherwise stall every request being served at the time. One lock guards the link, since the keeper's thread and the request handlers both reach it and the protocol is one request and then its reply over a single transport.

  Four transports sit behind `backend/app/deq_transport.py`, which also holds the piece they share: `FrameJoiner` cuts whole frames out of whatever a link hands back, because every link carries the same frames and only the read differs — a bulk USB read returns one 512-byte packet, a socket read returns whatever has arrived. It imports nothing optional, so `app/test_deq_transport.py` tests the framing, the 512-byte pad rule included, with no USB stack installed. `DEQ_TRANSPORT=fake` is the default and talks to `backend/app/testing/fake_deq.py`, which answers by the rules measured from 217 request-and-reply pairs of real DEQ-S1000A2 traffic; `app/testing/test_fake_deq.py` checks that it reproduces a captured reply byte for byte, so it stands in for the unit rather than for our own guesses. `DEQ_TRANSPORT=usb` talks to a real unit over bulk transfers through `backend/app/usb_transport.py`, which needs the `usb` extra:

```bash
cd backend && uv sync --extra usb
PYTHONPATH=. DEQ_TRANSPORT=usb uv run uvicorn app.main:app --port 8420
```

  `DEQ_TRANSPORT=accessory` is the one that reaches a DEQ in a car, and it needs no extra at all. It talks to the unit through the Pi's accessory gadget, over `backend/app/accessory_transport.py`:

```bash
cd backend
PYTHONPATH=. DEQ_TRANSPORT=accessory uv run uvicorn app.main:app --port 8420
```

  `DEQ_TRANSPORT=simulator` is the fake unit with knobs on, for working on the frontend without hardware. It is `FakeDeq` plus a state file, so every protocol rule stays pinned to real captures and only the reported state varies. `backend/scripts/deq_console.py` is a small curses console that writes that file; the simulator re-reads it before each reply, so a key press shows up in the next frame and nothing restarts. Run the two side by side:

```bash
make dev-sim    # the whole stack against the simulated unit
make console    # in a second terminal, to change what it reports
```

  It moves the volume, mutes, sets the driving state, and turns on the faults a real unit can show: refusing the open with `STATUS -5` and then going quiet, failing one command, and reporting system error flags. Refuse the open and `/api/device` reports `connected: false` with the unit's own reason; clear it and the link comes back. `DEQ_SIMULATOR_STATE` names the file if the default `deq-simulator-state.json` is in the way.

  It knows nothing about the Pi and reaches no hardware. There is deliberately no "audio flowing" switch either: audio is a separate USB function and the DEQ never reports on it, so the switch would invent a protocol field that does not exist.

  That transport exists because a laptop's own USB-C port is usually host-only hardware, and the DEQ is itself a USB host when connected over its own USB-A port: two hosts plugged together answer each other with silence, not an error. A Pi can present the device side, so it runs a gadget that answers the DEQ's Android Open Accessory handshake — the unit expects to talk to a tablet running Pioneer's own app, and the Pi takes that place.

  The gadget program owns the USB handle, not the backend. It answers the mode-switch request, re-enumerates the gadget, puts the accessory interface where the unit expects it, and feeds the audio function the unit demands before it will talk. None of that is the backend's work, and the handle cannot be shared: two writers on one link interleave frames. So the gadget keeps the handle and relays whole frames over a Unix socket, and `accessory_transport.py` is the other end of that socket. While the backend is attached the gadget sends nothing of its own — no cold start, no keepalive — because the backend's session carries both; when the backend detaches, the gadget takes the link back over so it does not drop. The SysEx framing and all command parsing stay in `deq_protocol.py`, unchanged. The gadget program itself is not in this repository.

- **A real unit** — answering. A DEQ-S1000A2 in a car answered all ten commands of the read-only cold start, each with `STATUS 0`: its firmware version (2.02), its device id, and 2032 bytes of tuning state that this app's own blob decoder read on the first try. So the protocol work is confirmed against hardware and not only against captures.

  Getting there cost four bugs worth knowing about, because anything reimplementing this inherits them. The session must open with `0x00` and that frame must carry its 24-byte body — an empty one is answered with `STATUS -5` in 40ms and then ignored, which reads exactly like success if nobody checks `STATUS`. Every capture shows `0x02` opening instead, because every capture was taken mid-session. The accessory interface has to land at index 2, and the audio function has to be a source rather than a sink.

  `backend/scripts/check_real_deq.py` is the check to run against a unit. It uses `DEQ_TRANSPORT`, same as the app itself:

```bash
cd backend
PYTHONPATH=. uv run python scripts/check_real_deq.py   # the accessory gadget, this script's default

cd backend && uv sync --extra usb
DEQ_TRANSPORT=usb PYTHONPATH=. uv run python scripts/check_real_deq.py
```

  It reads only, unless you pass `--write` (which writes the unit's own settings back unchanged). Each check prints `ok`, `DIFFERS` or `FAILED`. A `DIFFERS` line is the valuable one: the unit answered, but not the way the app and the captures predicted. Record those in the private notes — the Pioneer app and the unit are the authority, and this code is what is under test. The `accessory` transport opens a socket and needs no privileges of its own. The `usb` transport opens a USB device, which on Linux usually needs root or a udev rule: `backend/scripts/99-pioneer-deq.rules` is one, with the install steps in its own comment.

  `backend/scripts/probe_audio_output.py` sends source modes to a real unit and holds each one long enough to hear what comes out. It answered the hardware question this project was stuck on, in a car on 2026-10-08: on `SP_OTHER_SOURCE` the unit plays what this device writes over USB, and on `THROUGH` it plays the car's own audio — both with the USB audio function attached, so a session and the car radio are not in conflict. `THROUGH` is what a connect leaves the unit on. One catch the probe also found: the unit refuses a volume write with `STATUS -6` while it holds `THROUGH` and accepts one on an OTHER mode, so the mode goes first.

```bash
cd backend
DEQ_TRANSPORT=accessory PYTHONPATH=. uv run python scripts/probe_audio_output.py
```

  It writes to the unit, and it puts the mode and the volume it found back when it finishes. Rehearse it against the fake first, where it costs nothing: `DEQ_TRANSPORT=fake PYTHONPATH=. uv run python scripts/probe_audio_output.py --hold-seconds 0`.
