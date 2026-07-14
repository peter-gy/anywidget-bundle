from __future__ import annotations

import pathlib
from typing import ClassVar

import pytest

from anywidget_bundle import Bundle, BundleArtifactError, BundledWidget


def write_bundle(path: pathlib.Path, *, css: str | None = None) -> Bundle:
    path.mkdir(parents=True, exist_ok=True)
    path.joinpath("index.js").write_text("export default {};", encoding="utf-8")
    if css is not None:
        path.joinpath("widget.css").write_text(css, encoding="utf-8")
    return Bundle(path)


def test_resolves_fixed_build_artifacts(tmp_path: pathlib.Path) -> None:
    bundle = write_bundle(tmp_path, css=".widget { color: red; }")

    esm, css = bundle.anywidget_assets()

    assert esm == tmp_path / "index.js"
    assert css == tmp_path / "widget.css"


def test_allows_a_css_free_bundle(tmp_path: pathlib.Path) -> None:
    bundle = write_bundle(tmp_path)

    _, css = bundle.anywidget_assets()

    assert css == ""


def test_reports_a_missing_entry(tmp_path: pathlib.Path) -> None:
    with pytest.raises(BundleArtifactError, match="entry is missing"):
        Bundle(tmp_path).anywidget_assets()


def test_rejects_an_entry_symlink_outside_the_bundle(tmp_path: pathlib.Path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    outside = tmp_path / "outside.js"
    outside.write_text("export default {};", encoding="utf-8")
    static_dir.joinpath("index.js").symlink_to(outside)

    with pytest.raises(BundleArtifactError, match="escapes its static directory"):
        Bundle(static_dir).anywidget_assets()


def test_uses_the_development_server(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WIDGET_VITE_SERVER", "127.0.0.1:5173/")
    bundle = Bundle(tmp_path, dev_server_env="WIDGET_VITE_SERVER")

    assert bundle.anywidget_assets() == (
        "http://127.0.0.1:5173/@anywidget-bundle/entry?anywidget",
        "",
    )


def test_preserves_a_development_server_path(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WIDGET_VITE_SERVER", "https://example.test/vite/")
    bundle = Bundle(
        tmp_path,
        dev_server_env="WIDGET_VITE_SERVER",
        dev_entry="/@weather-widget/entry",
    )

    assert bundle.anywidget_assets()[0] == (
        "https://example.test/vite/@weather-widget/entry?anywidget"
    )


@pytest.mark.parametrize(
    "value",
    [
        "entry",
        "//entry",
        "/",
        "/entry/",
        "/entry?query",
        "/entry#fragment",
        "/%2e%2e/entry",
        "/a//b",
    ],
)
def test_rejects_invalid_development_entries(tmp_path: pathlib.Path, value: str) -> None:
    with pytest.raises(ValueError, match="dev_entry"):
        Bundle(tmp_path, dev_entry=value)


@pytest.mark.parametrize(
    "value",
    [
        "file:///tmp/widget",
        "http://",
        "http://example.test:invalid",
        "https://example.test/vite?",
        "https://example.test/vite#",
    ],
)
def test_rejects_an_invalid_development_server(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv("WIDGET_VITE_SERVER", value)
    bundle = Bundle(tmp_path, dev_server_env="WIDGET_VITE_SERVER")

    with pytest.raises(ValueError, match=r"HTTP server URL|query or fragment"):
        bundle.anywidget_assets()


def test_widget_materializes_bundle_text(tmp_path: pathlib.Path) -> None:
    class Widget(BundledWidget):
        bundle: ClassVar[Bundle] = write_bundle(tmp_path, css=".widget {}")

    widget = Widget()

    assert widget._esm == "export default {};"
    assert widget._css == ".widget {}"


def test_widget_can_leave_css_to_the_application(tmp_path: pathlib.Path) -> None:
    class Widget(BundledWidget):
        bundle: ClassVar[Bundle] = write_bundle(tmp_path, css=".widget {}")
        include_bundle_css: ClassVar[bool] = False

    assert Widget()._css == ""


def test_widget_reports_invalid_utf8(tmp_path: pathlib.Path) -> None:
    tmp_path.joinpath("index.js").write_bytes(b"\xff")

    class Widget(BundledWidget):
        bundle: ClassVar[Bundle] = Bundle(tmp_path)

    with pytest.raises(BundleArtifactError, match="could not be read"):
        Widget()
