.PHONY: help install install-backend install-frontend \
        dev dev-backend dev-frontend dev-simulator console \
        test test-backend test-frontend e2e e2e-install \
        typecheck generate-dto check-real-deq clean

BACKEND_PORT := 8420
FRONTEND_PORT := 5173

help:
	@echo "Targets:"
	@echo "  make install        Install backend and frontend dependencies"
	@echo "  make dev            Run backend and frontend dev servers together"
	@echo "  make dev-backend    Run only the backend dev server (port $(BACKEND_PORT))"
	@echo "  make dev-frontend   Run only the frontend dev server (port $(FRONTEND_PORT))"
	@echo "  make dev-simulator  Run the backend against a simulated DEQ you can change"
	@echo "  make console        Change what the simulated DEQ reports (run beside it)"
	@echo "  make test           Run backend and frontend tests"
	@echo "  make e2e            Run the end-to-end tests in a real browser"
	@echo "  make e2e-install    Install the browser the end-to-end tests need"
	@echo "  make typecheck      Type-check the frontend"
	@echo "  make generate-dto   Regenerate frontend DTOs from the backend schema"
	@echo "  make check-real-deq Run the conformance check against a real unit (needs hardware)"
	@echo "  make clean          Remove build artifacts and local databases"

install: install-backend install-frontend

install-backend:
	cd backend && uv sync

install-frontend:
	cd frontend && npm install

dev:
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend:
	cd backend && PYTHONPATH=. uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)

dev-frontend:
	cd frontend && npm run dev -- --port $(FRONTEND_PORT)

# A backend whose DEQ answers are yours to change, for frontend work with
# no hardware. Run `make console` beside it to move the volume, mute, or
# turn on a fault.
dev-simulator:
	cd backend && PYTHONPATH=. DEQ_TRANSPORT=simulator \
		uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)

console:
	cd backend && uv run python scripts/deq_console.py

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm test

e2e-install:
	cd frontend && npx playwright install --with-deps chromium

e2e:
	cd frontend && npx playwright test

typecheck:
	cd frontend && npx tsc --noEmit

generate-dto:
	cd backend && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd frontend && npm run generate:dto

# Needs a real DEQ on USB or an ESP bridge. DEQ_TRANSPORT picks which:
#   make check-real-deq DEQ_TRANSPORT=usb
#   make check-real-deq DEQ_TRANSPORT=esp-bridge DEQ_ESP_BRIDGE_PORT=/dev/ttyACM0
DEQ_TRANSPORT ?= usb

check-real-deq:
	cd backend && PYTHONPATH=. DEQ_TRANSPORT=$(DEQ_TRANSPORT) \
		uv run python scripts/check_real_deq.py

clean:
	rm -f backend/deq.db
	rm -f backend/deq-simulator-state.json
	rm -rf backend/.venv
	rm -rf frontend/node_modules
