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

  Two transports sit behind `backend/app/deq_transport.py`. `DEQ_TRANSPORT=fake` is the default and talks to `backend/app/testing/fake_deq.py`, which answers by the rules measured from 217 request-and-reply pairs of real DEQ-S1000A2 traffic; `app/testing/test_fake_deq.py` checks that it reproduces a captured reply byte for byte, so it stands in for the unit rather than for our own guesses. `DEQ_TRANSPORT=usb` talks to a real unit over bulk transfers through `backend/app/usb_transport.py`, which needs the `usb` extra:

```bash
cd backend && uv sync --extra usb
PYTHONPATH=. DEQ_TRANSPORT=usb uv run uvicorn app.main:app --port 8420
```

- **A real unit** — not yet confirmed. Everything above was built from the Pioneer app and from captured traffic. The DEQ has never enumerated on the development laptop, in either position of its mode switch, so no real unit has answered this code. The USB transport is written from the app's own native calls (`libaeusb.so` is stock libusb and uses `libusb_bulk_transfer`) and its framing is tested against captured frames split into 512-byte bulk packets, but the hardware itself is untested.

  `backend/scripts/check_real_deq.py` is what closes that gap. Plug a unit in and run it:

```bash
cd backend && uv sync --extra usb
PYTHONPATH=. uv run python scripts/check_real_deq.py
```

  It reads only, unless you pass `--write` (which writes the unit's own settings back unchanged). Each check prints `ok`, `DIFFERS` or `FAILED`. A `DIFFERS` line is the valuable one: the unit answered, but not the way the app and the captures predicted. Record those in the private notes — the Pioneer app and the unit are the authority, and this code is what is under test. On Linux, opening a USB device usually needs `sudo -E env PYTHONPATH=. ...` or a udev rule for `08e4:01ed`.
