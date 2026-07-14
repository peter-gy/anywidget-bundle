from __future__ import annotations

import anywidget_bundle


def test_public_api_is_small() -> None:
    assert anywidget_bundle.__all__ == [
        "Bundle",
        "BundleArtifactError",
        "BundleModuleError",
        "BundledWidget",
    ]
