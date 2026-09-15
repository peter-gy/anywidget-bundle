"""Load Vite-built anywidget assets and serve their JavaScript modules."""

from __future__ import annotations

import dataclasses
import functools
import json
import os
import pathlib
import re
import stat
from collections.abc import Mapping, Sequence
from typing import Any, ClassVar
from urllib.parse import urlsplit

import anywidget
import traitlets

_DEFAULT_DEV_ENTRY = "/@anywidget-bundle/entry"
_MANIFEST_FILE = "anywidget.json"
# Version checks use exact integer types because bool compares equal to 1.
_PROTOCOL_VERSION = 1
_REQUEST_TYPE = "anywidget-bundle:request"
_RESPONSE_TYPE = "anywidget-bundle:response"
_JAVASCRIPT_EXTENSIONS = frozenset({".js", ".mjs"})
_STYLE_EXTENSIONS = frozenset({".css"})
_PORTABLE_PATH_SEGMENT = re.compile(r"[A-Za-z0-9._-]+")
_DEV_PATH_SEGMENT = re.compile(r"[A-Za-z0-9._@-]+")
_RESERVED_FILENAMES = frozenset(
    {"con", "prn", "aux", "nul"}
    | {f"com{index}" for index in range(1, 10)}
    | {f"lpt{index}" for index in range(1, 10)}
)


class BundleArtifactError(RuntimeError):
    """Raised when a built bundle is missing or has an invalid manifest."""


class BundleModuleError(RuntimeError):
    """Raised when a requested JavaScript module cannot be served."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclasses.dataclass(frozen=True)
class _BundleManifest:
    entry: str
    style: str | None
    app: str
    modules: tuple[str, ...]


@dataclasses.dataclass(frozen=True, init=False)
class Bundle:
    """Resolve assets from a version 1 ``anywidget.json`` manifest.

    ``static_dir`` is resolved when the bundle is created, so later working
    directory changes do not affect artifact lookup. ``dev_server_env`` names
    the environment variable that selects a Vite server base URL. ``dev_entry``
    is the server path for the development module. The loader appends the
    anywidget query parameter when it builds the development URL.
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
        object.__setattr__(
            self,
            "static_dir",
            pathlib.Path(static_dir).expanduser().resolve(),
        )
        object.__setattr__(self, "dev_server_env", dev_server_env)
        object.__setattr__(self, "dev_entry", _validate_dev_entry(dev_entry))

    def anywidget_assets(self) -> tuple[str | pathlib.Path, str | pathlib.Path]:
        """Return the anywidget ESM and CSS assets for this bundle."""

        dev_server = self._dev_server()
        if dev_server is not None:
            # Vite owns the app graph and imported styles during development.
            return f"{dev_server}{self.dev_entry}?anywidget", ""

        # The built path gives anywidget the bootstrap and stylesheet. Validate
        # the complete graph before a model can request any of its modules.
        self.validate()
        manifest = self._manifest
        entry = self._artifact_path(manifest.entry)
        style = self._artifact_path(manifest.style) if manifest.style is not None else ""
        return entry, style

    def validate(self) -> None:
        """Validate that every artifact named by the manifest is a regular file."""

        manifest = self._manifest
        artifact_paths = [manifest.entry, *manifest.modules]
        if manifest.style is not None:
            artifact_paths.append(manifest.style)

        for relative_path in artifact_paths:
            artifact = self._artifact_path(relative_path)
            try:
                mode = artifact.stat().st_mode
            except FileNotFoundError as error:
                raise BundleArtifactError(
                    f"anywidget bundle artifact is missing: {relative_path}"
                ) from error
            except OSError as error:
                raise BundleArtifactError(
                    f"anywidget bundle artifact could not be inspected: {relative_path}"
                ) from error
            if not stat.S_ISREG(mode):
                raise BundleArtifactError(
                    f"anywidget bundle artifact must be a regular file: {relative_path}"
                )

    def read_style(self) -> str:
        """Return stylesheet source, or an empty string in CSS-free and development modes."""

        if self._dev_server() is not None:
            return ""
        style = self._manifest.style
        if style is None:
            return ""
        return _asset_text(self._artifact_path(style))

    def read_module(self, module_path: object) -> str:
        """Read an exact JavaScript module listed by the bundle manifest."""

        if not isinstance(module_path, str) or not _is_javascript_path(module_path):
            raise BundleModuleError(
                "invalid_path",
                "Requested module is not part of this bundle.",
            )
        if module_path not in self._manifest.modules:
            raise BundleModuleError(
                "invalid_path",
                "Requested module is not part of this bundle.",
            )

        try:
            module = self._artifact_path(module_path)
        except BundleArtifactError as error:
            raise BundleModuleError(
                "invalid_path",
                "Requested module is not part of this bundle.",
            ) from error

        try:
            return module.read_text(encoding="utf-8")
        except FileNotFoundError as error:
            raise BundleModuleError(
                "not_found",
                "Requested bundle module was not found.",
            ) from error
        except (OSError, UnicodeError) as error:
            raise BundleModuleError(
                "read_failed",
                "Requested bundle module could not be read.",
            ) from error

    # Parse and validate the manifest once so every module request uses one
    # stable allowlist.
    @functools.cached_property
    def _manifest(self) -> _BundleManifest:
        manifest_path = self._artifact_path(_MANIFEST_FILE)
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        except FileNotFoundError as error:
            raise BundleArtifactError("anywidget bundle manifest is missing") from error
        except json.JSONDecodeError as error:
            raise BundleArtifactError("anywidget bundle manifest is not valid JSON") from error
        except (OSError, UnicodeError) as error:
            raise BundleArtifactError("anywidget bundle manifest could not be read") from error
        return _parse_manifest(raw)

    def _artifact_path(self, relative_path: str) -> pathlib.Path:
        candidate = self.static_dir.joinpath(*pathlib.PurePosixPath(relative_path).parts)
        try:
            # Resolve symlinks before containment so each artifact target stays
            # inside static_dir.
            resolved = candidate.resolve()
        except (OSError, RuntimeError) as error:
            raise BundleArtifactError("anywidget bundle artifact could not be resolved") from error
        try:
            resolved.relative_to(self.static_dir)
        except ValueError as error:
            raise BundleArtifactError(
                "anywidget bundle artifact escapes its static directory"
            ) from error
        return resolved

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
    """anywidget model that serves bundle modules over custom messages."""

    bundle: ClassVar[Bundle]
    include_bundle_css: ClassVar[bool] = True
    bundle_status = traitlets.Dict(default_value={"state": "idle"}, read_only=True)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        # AnyWidget snapshots instance-level _esm and _css when it creates their
        # synchronized traits, so materialize file paths before its initializer.
        esm, css = self.bundle.anywidget_assets()
        self._esm = _asset_text(esm)
        self._css = _asset_text(css) if self.include_bundle_css else ""
        super().__init__(*args, **kwargs)
        self.on_msg(self._handle_bundle_message)

    def _handle_bundle_message(
        self,
        _widget: object,
        content: object,
        _buffers: Sequence[memoryview],
    ) -> None:
        # Custom messages share the widget comm. Leave envelopes owned by other
        # features untouched.
        if not isinstance(content, Mapping):
            return
        if content.get("type") == "anywidget-bundle:status":
            if type(content.get("version")) is not int or content.get("version") != 1:
                return
            state = content.get("state")
            if state not in ("loading", "ready", "error", "disposed"):
                return
            status: dict[str, Any] = {"state": state}
            if state == "error":
                error = content.get("error")
                if not isinstance(error, Mapping) or error.get("phase") not in (
                    "load",
                    "initialize",
                    "render",
                ):
                    return
                if not all(isinstance(error.get(key), str) for key in ("name", "message", "stack")):
                    return
                status["error"] = {
                    key: error.get(key) for key in ("phase", "name", "message", "stack")
                }
            self.set_trait("bundle_status", status)
            return
        if content.get("type") != _REQUEST_TYPE:
            return

        request_id = content.get("id")
        module_path = content.get("path")
        # Imports can resolve out of order, so every response carries enough
        # request identity for the browser to settle the matching promise.
        response: dict[str, Any] = {
            "type": _RESPONSE_TYPE,
            "version": _PROTOCOL_VERSION,
            "id": request_id if isinstance(request_id, str) else "",
            "path": module_path if isinstance(module_path, str) else "",
        }

        if type(content.get("version")) is not int or content.get("version") != _PROTOCOL_VERSION:
            response["error"] = {
                "code": "unsupported_version",
                "message": "Bundle module protocol version must be 1.",
            }
            self.send(response)
            return
        if not isinstance(request_id, str) or not request_id or not isinstance(module_path, str):
            response["error"] = {
                "code": "invalid_request",
                "message": "Bundle module request requires string id and path fields.",
            }
            self.send(response)
            return

        try:
            source = self.bundle.read_module(module_path)
        except BundleModuleError as error:
            response["error"] = {"code": error.code, "message": str(error)}
            self.send(response)
            return
        # Keep source outside synchronized state and JSON by sending one binary
        # comm buffer.
        self.send(response, buffers=[source.encode("utf-8")])


def _parse_manifest(raw: object) -> _BundleManifest:
    if not isinstance(raw, Mapping):
        raise BundleArtifactError("anywidget bundle manifest must be an object")
    if type(raw.get("version")) is not int or raw.get("version") != 1:
        raise BundleArtifactError("anywidget bundle manifest version must be 1")
    entry = raw.get("entry")
    if not isinstance(entry, str) or not _is_javascript_path(entry):
        raise BundleArtifactError(
            "anywidget bundle manifest entry must be a relative JavaScript path"
        )

    if "style" not in raw:
        raise BundleArtifactError(
            "anywidget bundle manifest style must be a relative CSS path or null"
        )
    style = raw.get("style")
    if style is None:
        manifest_style = None
    elif isinstance(style, str) and _is_artifact_path(style, _STYLE_EXTENSIONS):
        manifest_style = style
    else:
        raise BundleArtifactError(
            "anywidget bundle manifest style must be a relative CSS path or null"
        )

    app = raw.get("app")
    if not isinstance(app, str) or not _is_javascript_path(app):
        raise BundleArtifactError(
            "anywidget bundle manifest app must be a relative JavaScript path"
        )

    modules = raw.get("modules")
    if not isinstance(modules, list):
        raise BundleArtifactError(
            "anywidget bundle manifest modules must be unique JavaScript paths"
        )
    module_paths: list[str] = []
    for module_path in modules:
        if not isinstance(module_path, str) or not _is_javascript_path(module_path):
            raise BundleArtifactError(
                "anywidget bundle manifest modules must be unique JavaScript paths"
            )
        module_paths.append(module_path)
    # anywidget evaluates entry directly. The runtime requests app and split
    # chunks through modules, which is the transport allowlist.
    if (
        not module_paths
        or len(module_paths) != len(set(module_paths))
        or app not in module_paths
        or entry in module_paths
    ):
        raise BundleArtifactError(
            "anywidget bundle manifest modules must contain unique JavaScript paths, "
            "include app, and exclude entry"
        )
    artifact_paths = [_MANIFEST_FILE, entry, *module_paths]
    if manifest_style is not None:
        artifact_paths.append(manifest_style)
    if _artifact_paths_conflict(artifact_paths):
        raise BundleArtifactError("anywidget bundle manifest artifact paths must not collide")
    return _BundleManifest(
        entry=entry,
        style=manifest_style,
        app=app,
        modules=tuple(module_paths),
    )


def _is_javascript_path(value: str) -> bool:
    return _is_artifact_path(value, _JAVASCRIPT_EXTENSIONS)


def _is_artifact_path(value: str, extensions: frozenset[str]) -> bool:
    if not _is_safe_relative_path(value):
        return False
    name = value.rsplit("/", 1)[-1]
    return any(len(name) > len(extension) and name.endswith(extension) for extension in extensions)


def _is_safe_relative_path(value: str) -> bool:
    # Artifact names cross JavaScript, wheel archives, and filesystems. An ASCII
    # grammar keeps validation identical across runtimes and Unicode versions.
    parts = value.split("/")
    return (
        bool(value)
        and all(part not in ("", ".", "..") for part in parts)
        and all(_PORTABLE_PATH_SEGMENT.fullmatch(part) is not None for part in parts)
        and all(not part.endswith(".") for part in parts)
        and all(part.split(".", 1)[0].lower() not in _RESERVED_FILENAMES for part in parts)
    )


def _artifact_paths_conflict(paths: Sequence[str]) -> bool:
    # The ASCII path grammar makes lowercase a stable cross-runtime key. Catch
    # case aliases and file-directory overlaps before a filesystem merges them.
    normalized = [path.lower() for path in paths]
    return any(
        path == other or path.startswith(f"{other}/")
        for index, path in enumerate(normalized)
        for other_index, other in enumerate(normalized)
        if index != other_index
    )


def _validate_dev_entry(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("dev_entry must be an absolute URL path")

    parts = value[1:].split("/")
    if (
        not value.startswith("/")
        or value.startswith("//")
        or "%" in value
        or any(part in ("", ".", "..") for part in parts)
        or any(_DEV_PATH_SEGMENT.fullmatch(part) is None for part in parts)
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
