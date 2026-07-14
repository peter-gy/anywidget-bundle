VP := pnpm exec vp

.PHONY: build check format test

build:
	$(VP) run -F './apps/*' -F './packages/*' build
	uv build --package anywidget-bundle --out-dir dist/python

check:
	$(VP) check
	$(VP) run -r typecheck
	uv run ruff format --check
	uv run ruff check
	uv run ty check
	uv run pyrefly check

format:
	$(VP) fmt
	uv run ruff format

test:
	$(VP) run -F './packages/*' test
	uv run pytest
