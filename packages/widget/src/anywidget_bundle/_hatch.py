"""Validate consumer bundle artifacts before Hatch builds an archive."""

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface
from hatchling.plugin import hookimpl

from ._bundle import Bundle


class BundleBuildHook(BuildHookInterface):
    PLUGIN_NAME = "anywidget-bundle"

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            return
        directory = self.config.get("directory")
        if not isinstance(directory, str) or not directory:
            raise ValueError("anywidget-bundle build hook requires a directory")
        Bundle(Path(self.root) / directory).validate()


@hookimpl
def hatch_register_build_hook() -> type[BundleBuildHook]:
    return BundleBuildHook
