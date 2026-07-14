"""Resolve the fixed artifacts emitted by the anywidget-bundle Vite plugin."""

from __future__ import annotations

import dataclasses
import os
import pathlib
from typing import Any, ClassVar
from urllib.parse import urlsplit

import anywidget

_DEFAULT_DEV_ENTRY = "/@anywidget-bundle/entry"
_ENTRY_FILE = "index.js"
_STYLE_FILE = "widget.css"


class BundleArtifactError(RuntimeError):
    """Raised when a bundle artifact is missing, unreadable, or outside its directory."""


@dataclasses.dataclass(frozen=True, init=False)
class Bundle:
    """Resolve a production build or a Vite development entry.

    Args:
        static_dir: Directory containing ``index.js`` and optional ``widget.css``.
        dev_server_env: Environment variable containing a Vite server URL.
        dev_entry: Absolute Vite path served while ``dev_server_env`` is set.
    """

    static_dir: pathlib.Path
    dev_server_env: str | None
    dev_entry: str

    def __init__(
        self,
        static_dir: str | pathlib.Path,
        dev_server_env: str | None = None,
        dev_entry: str = _DEFAULT_DEV_ENTRY,
    ) -> None:
        object.__setattr__(self, "static_dir", pathlib.Path(static_dir).expanduser().resolve())
        object.__setattr__(self, "dev_server_env", dev_server_env)
        object.__setattr__(self, "dev_entry", _validate_dev_entry(dev_entry))

    def anywidget_assets(self) -> tuple[str | pathlib.Path, str | pathlib.Path]:
        """Return the ESM and CSS values consumed by ``anywidget.AnyWidget``."""

        dev_server = self._dev_server()
        if dev_server is not None:
            return f"{dev_server}{self.dev_entry}?anywidget", ""

        entry = self._artifact(_ENTRY_FILE)
        if not entry.is_file():
            raise BundleArtifactError("anywidget bundle entry is missing")
        style = self._artifact(_STYLE_FILE)
        return entry, style if style.is_file() else ""

    def _artifact(self, name: str) -> pathlib.Path:
        try:
            artifact = (self.static_dir / name).resolve()
            artifact.relative_to(self.static_dir)
        except (OSError, RuntimeError, ValueError) as error:
            raise BundleArtifactError(
                "anywidget bundle artifact escapes its static directory"
            ) from error
        return artifact

    def _dev_server(self) -> str | None:
        if self.dev_server_env is None:
            return None
        value = os.environ.get(self.dev_server_env, "").strip()
        if not value:
            return None
        if "://" not in value:
            value = f"http://{value}"
        try:
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError as error:
            raise ValueError(f"{self.dev_server_env} must contain an HTTP server URL") from error
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.hostname is None
            or (port is not None and not 0 < port < 65536)
        ):
            raise ValueError(f"{self.dev_server_env} must contain an HTTP server URL")
        if "?" in value or "#" in value:
            raise ValueError(f"{self.dev_server_env} must not contain a query or fragment")
        return value.rstrip("/")


class BundledWidget(anywidget.AnyWidget):
    """AnyWidget base class backed by a :class:`Bundle`."""

    bundle: ClassVar[Bundle]
    include_bundle_css: ClassVar[bool] = True

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        esm, css = self.bundle.anywidget_assets()
        self._esm = _asset_text(esm)
        self._css = _asset_text(css) if self.include_bundle_css else ""
        super().__init__(*args, **kwargs)


def _validate_dev_entry(value: object) -> str:
    if (
        not isinstance(value, str)
        or not value.startswith("/")
        or value.startswith("//")
        or value == "/"
        or any(character in value for character in "?#%\\")
        or any(part in {"", ".", ".."} for part in value[1:].split("/"))
    ):
        raise ValueError("dev_entry must be an absolute URL path without query or fragment")
    return value


def _asset_text(asset: str | pathlib.Path) -> str:
    if not isinstance(asset, pathlib.Path):
        return asset
    try:
        return asset.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise BundleArtifactError("anywidget bundle asset is missing") from error
    except (OSError, UnicodeError) as error:
        raise BundleArtifactError("anywidget bundle asset could not be read") from error
