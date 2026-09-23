.PHONY: help install install-backend install-frontend \
        dev dev-backend dev-frontend \
        test test-backend test-frontend \
        typecheck generate-dto clean

BACKEND_PORT := 8420
FRONTEND_PORT := 5173

help:
	@echo "Targets:"
	@echo "  make install        Install backend and frontend dependencies"
	@echo "  make dev            Run backend and frontend dev servers together"
	@echo "  make dev-backend    Run only the backend dev server (port $(BACKEND_PORT))"
	@echo "  make dev-frontend   Run only the frontend dev server (port $(FRONTEND_PORT))"
	@echo "  make test           Run backend and frontend tests"
	@echo "  make typecheck      Type-check the frontend"
	@echo "  make generate-dto   Regenerate frontend DTOs from the backend schema"
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

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm test

typecheck:
	cd frontend && npx tsc --noEmit

generate-dto:
	cd backend && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd frontend && npm run generate:dto

clean:
	rm -f backend/deq.db
	rm -rf backend/.venv
	rm -rf frontend/node_modules
