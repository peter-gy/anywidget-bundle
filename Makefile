VP := pnpm exec vp

.PHONY: build check format test e2e

build:
	$(VP) run -F './apps/*' -F './packages/*' build
	uv build --package anywidget-bundle --out-dir dist/python

check:
	$(VP) check
	$(VP) run -r typecheck
	pnpm check:knip
	uv lock --check
	uv run --frozen ruff format --check
	uv run --frozen ruff check
	uv run --frozen ty check
	uv run --frozen pyrefly check

format:
	$(VP) fmt
	uv run --frozen ruff format

test:
	$(VP) run -F './packages/*' test
	uv run --frozen pytest
	$(MAKE) e2e

e2e:
	pnpm --filter @anywidget-bundle/e2e test:e2e
