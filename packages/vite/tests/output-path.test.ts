import { describe, expect, test } from "vite-plus/test";

import anywidgetBundle from "../src/index";

type InvalidOptionsCase = {
  label: string;
  overrides: {
    output: string | null | { entry?: string | null; app?: string; style?: string; entyr?: string };
  };
  message: string;
};

describe("anywidgetBundle output paths", () => {
  test.each([
    {
      label: "a null output object",
      overrides: { output: null },
      message: "output must be an object",
    },
    {
      label: "a string output object",
      overrides: { output: "typo" },
      message: "output must be an object",
    },
    {
      label: "a null output entry",
      overrides: { output: { entry: null } },
      message: "output.entry",
    },
    {
      label: "an unknown output field",
      overrides: { output: { entyr: "widget.js" } },
      message: "output.entyr is not supported",
    },
    {
      label: "a parent segment in an output entry",
      overrides: { output: { entry: "../widget.js" } },
      message: "output.entry",
    },
    {
      label: "an absolute output app path",
      overrides: { output: { app: "/modules/app.js" } },
      message: "output.app",
    },
    {
      label: "a JavaScript extension for output style",
      overrides: { output: { style: "styles/widget.js" } },
      message: "output.style",
    },
    {
      label: "an extension-only output entry",
      overrides: { output: { entry: ".js" } },
      message: "output.entry",
    },
    {
      label: "an extension-only output app",
      overrides: { output: { app: "chunks/.mjs" } },
      message: "output.app",
    },
    {
      label: "an extension-only output style",
      overrides: { output: { style: "styles/.css" } },
      message: "output.style",
    },
    {
      label: "a Vite placeholder in an output path",
      overrides: { output: { app: "modules/[name].js" } },
      message: "output.app",
    },
    {
      label: "a reserved filesystem component",
      overrides: { output: { app: "modules/CON.js" } },
      message: "output.app",
    },
    {
      label: "a trailing dot in a path segment",
      overrides: { output: { app: "modules./app.js" } },
      message: "output.app",
    },
    {
      label: "a space in a path segment",
      overrides: { output: { app: "widget modules/app.js" } },
      message: "output.app",
    },
    {
      label: "a percent sign in a path segment",
      overrides: { output: { app: "modules/app%20copy.js" } },
      message: "output.app",
    },
    {
      label: "a non-ASCII output path",
      overrides: { output: { entry: "café.js" } },
      message: "output.entry",
    },
    {
      label: "an astral Unicode output path",
      overrides: { output: { entry: "😀.js" } },
      message: "output.entry",
    },
  ] satisfies InvalidOptionsCase[])("rejects $label", expectInvalidOptions);

  test.each([
    {
      label: "ASCII case-equivalent artifact paths",
      overrides: { output: { entry: "bundle.js", app: "BUNDLE.js" } },
      message: "must not collide",
    },
    {
      label: "an artifact path and its descendant",
      overrides: { output: { entry: "bundle.js", style: "bundle.js/widget.css" } },
      message: "must not collide",
    },
  ] satisfies InvalidOptionsCase[])("rejects $label", expectInvalidOptions);

  test("accepts the portable ASCII segment alphabet", () => {
    expect(() =>
      anywidgetBundle({
        app: "src/widget.ts",
        outDir: "dist",
        output: {
          entry: "esm/widget_entry-1.0.js",
          app: "chunks/app_entry-1.0.mjs",
          style: "styles/widget_theme-1.0.css",
        },
      }),
    ).not.toThrow();
  });
});

function expectInvalidOptions({ overrides, message }: InvalidOptionsCase): void {
  const options = {
    app: "src/widget.ts",
    outDir: "dist",
    ...overrides,
  };

  // @ts-expect-error Exercise malformed output options from JavaScript consumers.
  expect(() => anywidgetBundle(options)).toThrow(message);
}
