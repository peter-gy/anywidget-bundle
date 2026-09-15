import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const output = join(root, "dist/e2e");

const consumer = join(output, "consumer");

await mkdir(consumer, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });

  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

run("pnpm", ["--filter", "anywidget-bundle", "pack", "--pack-destination", join(output, "npm")]);

run("uv", ["build", "--package", "anywidget-bundle", "--out-dir", join(output, "loader")]);

const npmVersion = JSON.parse(
  await readFile(join(root, "packages/vite/package.json"), "utf8"),
).version;

const pythonVersion = spawnSync("uv", ["version", "--package", "anywidget-bundle", "--short"], {
  cwd: root,
  encoding: "utf8",
});

assert.equal(pythonVersion.status, 0, pythonVersion.stderr);

const tarball = `anywidget-bundle-${npmVersion}.tgz`;

const loaderWheel = `anywidget_bundle-${pythonVersion.stdout.trim()}-py3-none-any.whl`;

const wheelPath = join(output, "loader", loaderWheel);

await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));

run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    join(output, "npm", tarball),
    "vite@8.1.4",
  ],
  consumer,
);

await writeFile(
  join(consumer, "build.mjs"),
  'export { default } from "anywidget-bundle"; export { build, createServer } from "vite";',
);

const { build, default: anywidgetBundle } = await import(
  pathToFileURL(join(consumer, "build.mjs")).href
);

await Promise.all(
  ["app.js", "shared.js", "lazy.js", "style.css", "pixel.svg"].map(async (name) => {
    const source = await readFile(join(root, "apps/e2e", name), "utf8");
    await writeFile(
      join(consumer, name),
      source.replace("__BUNDLE_FIXTURE_PAYLOAD__", "x".repeat(128_000)),
    );
  }),
);

const publicDir = join(consumer, "public");

await mkdir(publicDir, { recursive: true });

await writeFile(join(publicDir, "icon.svg"), await readFile(join(consumer, "pixel.svg")));

try {
  await assert.rejects(
    build({
      configFile: false,
      root: consumer,
      plugins: [anywidgetBundle({ app: "./app.js", outDir: "src/e2e_widget/static" })],
    }),
    /cannot use a public directory/,
  );
} finally {
  await unlink(join(publicDir, "icon.svg"));
  await rmdir(publicDir);
}

await build({
  configFile: false,
  root: consumer,
  plugins: [anywidgetBundle({ app: "./app.js", outDir: "src/e2e_widget/static" })],
});

await writeFile(
  join(consumer, "src/e2e_widget/__init__.py"),
  await readFile(join(root, "apps/e2e/widget.py")),
);

await writeFile(
  join(consumer, "pyproject.toml"),
  `
[build-system]
requires = ["hatchling==1.31.0", "anywidget-bundle[build] @ ${pathToFileURL(wheelPath).href}"]
build-backend = "hatchling.build"
[project]
name = "bundle-e2e-fixture"
version = "0.0.0"
requires-python = ">=3.11"
dependencies = ["anywidget-bundle"]
[tool.hatch.build]
artifacts = ["src/e2e_widget/static/**"]
[tool.hatch.build.targets.wheel]
packages = ["src/e2e_widget"]
[tool.hatch.build.targets.sdist]
include = ["src/e2e_widget", "pyproject.toml"]
[tool.hatch.build.hooks.anywidget-bundle]
directory = "src/e2e_widget/static"
`,
);

run("uv", ["build", consumer, "--out-dir", join(output, "fixture")]);

const manifestPath = join(consumer, "src/e2e_widget/static/anywidget.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const split = join(
  consumer,
  "src/e2e_widget/static",
  manifest.modules.find((name) => name !== manifest.app),
);

const source = await readFile(split);

try {
  await unlink(split);

  const rejected = spawnSync(
    "uv",
    ["build", consumer, "--wheel", "--out-dir", join(output, "invalid")],
    { cwd: root, encoding: "utf8" },
  );

  assert.notEqual(rejected.status, 0, "Incomplete bundles must fail packaging");
  assert.match(rejected.stderr, /artifact is missing/);
} finally {
  await writeFile(split, source);
}

const sdist = "bundle_e2e_fixture-0.0.0.tar.gz";

run("uv", [
  "build",
  join(output, "fixture", sdist),
  "--wheel",
  "--out-dir",
  join(output, "from-sdist"),
]);

run("uv", ["venv", "--allow-existing", join(output, "venv")]);

// Jupyter's Node helpers require a CommonJS package boundary inside this ESM workspace.
await writeFile(join(output, "venv/package.json"), JSON.stringify({ type: "commonjs" }));

const python = join(
  output,
  "venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

const fixtureWheel = "bundle_e2e_fixture-0.0.0-py3-none-any.whl";

run("uv", [
  "pip",
  "install",
  "--upgrade",
  "--python",
  python,
  "--reinstall-package",
  "anywidget-bundle",
  "--reinstall-package",
  "bundle-e2e-fixture",
  wheelPath,
  join(output, "from-sdist", fixtureWheel),
  "jupyterlab==4.6.2",
  "ipykernel==7.3.0",
]);

console.log(
  "Packed npm, loader wheel, consumer wheel, sdist rebuild, and missing-chunk rejection verified.",
);
