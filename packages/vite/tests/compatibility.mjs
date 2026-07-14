import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import anywidgetBundle from "anywidget-bundle";
import { build } from "vite";

const root = await mkdtemp(join(tmpdir(), "anywidget-bundle-node-"));
const app = join(root, "app.js");
const outDir = join(root, "dist");

await writeFile(
  app,
  `
    import "./widget.css";
    export default {
      async render({ el }) {
        const lazy = await import("./lazy.js");
        el.textContent = lazy.label;
      },
    };
  `,
  "utf8",
);
await writeFile(join(root, "lazy.js"), `export const label = "ready";\n`, "utf8");
await writeFile(join(root, "widget.css"), `.widget { color: rebeccapurple; }\n`, "utf8");

await build({
  configFile: false,
  logLevel: "silent",
  plugins: [anywidgetBundle({ app, outDir })],
  root,
});

const manifest = JSON.parse(await readFile(join(outDir, "anywidget.json"), "utf8"));
assert.deepEqual(
  {
    version: manifest.version,
    entry: manifest.entry,
    app: manifest.app,
    style: manifest.style,
  },
  {
    version: 1,
    entry: "index.js",
    app: "chunks/app.js",
    style: "widget.css",
  },
);
assert.ok(Array.isArray(manifest.modules));
assert.equal(manifest.modules[0], manifest.app);
assert.ok(manifest.modules.length >= 2);
assert.ok(
  manifest.modules
    .slice(1)
    .every((modulePath) => /^chunks\/chunk-[A-Za-z0-9_-]+\.js$/.test(modulePath)),
);
assert.ok(manifest.modules.slice(1).every((modulePath) => !modulePath.includes("lazy")));

const bootstrap = await readFile(join(outDir, manifest.entry), "utf8");
assert.ok(Buffer.byteLength(bootstrap) < 64 * 1024);
assert.doesNotMatch(bootstrap, /(?:\bfrom\s*|\bimport\s*\(\s*)["']/);
assert.doesNotMatch(bootstrap, /rebeccapurple|el\.textContent/);

await Promise.all(
  manifest.modules.map(async (modulePath) => {
    assert.ok((await stat(join(outDir, modulePath))).isFile());
  }),
);
assert.ok((await stat(join(outDir, manifest.style))).isFile());
