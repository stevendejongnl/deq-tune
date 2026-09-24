# DEQ Tune

A web app for the equalizer and sound-profile part of Pioneer's Sound & Tune app.

This app edits DEQ tuning profiles: the 13-band graphic EQ, per-speaker level and time alignment, the high-pass filter, and fader/balance. It ships with the factory Mazda presets, extracted from the official Android app, and the device's built-in EQ-style and Live-Simulation DSP presets (Powerful, Super Bass, Concert hall, ...). The UI works in English, Japanese, German, French, Spanish, and Dutch, auto-detected from the browser. The profile list is a permanent sidebar on a desktop screen, a drawer on a tablet, and a bottom sheet on a phone. You can edit a factory preset directly, then revert it or save it as your own profile. It's also a PWA — installable, with an offline app shell. USB connect to the physical Pioneer DEQ unit is stubbed in the UI; the app does not yet speak the device's USB protocol (see [Status](#status)).

**Browser requirement:** this app needs [WebUSB](https://developer.chrome.com/docs/capabilities/usb) — Chrome or Edge, on desktop or Android. It does not work in Safari, Firefox, or any browser on iOS (WebUSB isn't available there at all), and shows a blocking message rather than a broken page in those browsers.

## Project layout

```
backend/    FastAPI + SQLite. Serves and stores profiles.
frontend/   Lit + TypeScript + Vite. The EQ editor, profile list, and USB connect UI. Also a PWA.
data/presets/  The bundled factory preset JSON files, extracted from the Pioneer APK.
openapi.json   The backend's exported API schema. The frontend generates its DTOs from this file.
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

## Regenerating the frontend DTOs

The backend's Pydantic models are the source of truth for the data shape. After changing `backend/app/eq_data.py` or `backend/app/schemas.py`, run `make generate-dto`, or by hand:

```bash
cd backend && PYTHONPATH=. uv run python scripts/export_openapi.py
cd ../frontend && npm run generate:dto
```

Commit the updated `openapi.json` and `frontend/src/dto/generated/openapi.d.ts` together with the schema change. The frontend's API client validates every request and response against these generated types at runtime (`typia.assert`), so a mismatch fails loudly instead of silently.

## Status

- **Profile editing** — works. Factory Mazda presets plus your own custom profiles, backed by the FastAPI backend.
- **Localization** — works. English, Japanese, German, French, Spanish, and Dutch, auto-detected from the browser on first visit and remembered after (`frontend/src/i18n/`). Preset and DSP-preset names are copied from the APK's own string resources per locale (`backend/app/preset_translations.py`, `frontend/src/i18n/preset-names.ts`, `frontend/src/i18n/dsp-presets.ts`) — the bundled preset JSON itself only carries Japanese display text. Note: Pioneer never localized the car/speaker-type names for German/French/Spanish/Dutch, so those show the same English text there; the EQ-style and Live-Simulation DSP preset names are genuinely translated in all six locales.
- **EQ Style / Live Simulation** — UI only, not yet wired to a device. These are the DEQ hardware's own built-in DSP presets (Powerful, Super Bass, Concert hall, ...), selected on the device itself over USB, not computed locally. Selecting one in the UI only updates local state for now — see `frontend/src/components/dsp-panel.ts`.
- **Browser gate** — works. `frontend/src/browser-support.ts` checks for WebUSB (`"usb" in navigator`) before mounting the app; Safari/Firefox/iOS visitors see a blocking message explaining why, instead of a half-working page.
- **USB connect** — pairing only. The Connect button in the header requests a Pioneer-vendor USB device over WebUSB (Chrome/Edge) and reports it once paired, but the app does not yet read or write EQ settings, or select an EQ Style / Live Simulation preset, over USB. The Pioneer DEQ command protocol lives in native code inside the Android app (`libasp-core.so` and friends), not in Java — reverse-engineering it needs a USB traffic capture against the real app and device, which hasn't been done yet.
