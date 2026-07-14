import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import anywidgetBundle from "anywidget-bundle";
import { build } from "vite";

const root = await mkdtemp(join(tmpdir(), "anywidget-bundle-node-"));
const app = join(root, "app.js");
const outDir = join(root, "dist");

await writeFile(app, "export default { initialize: () => ({ ready: true }) };\n", "utf8");
await build({
  configFile: false,
  logLevel: "silent",
  plugins: [anywidgetBundle({ app, outDir })],
  root,
});

assert.deepEqual(await readdir(outDir), ["index.js"]);
assert.match(await readFile(join(outDir, "index.js"), "utf8"), /DecompressionStream/);
