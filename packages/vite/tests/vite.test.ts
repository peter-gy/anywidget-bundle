import type { AnyModel, Experimental, Host } from "@anywidget/types";
import { init, parse } from "es-module-lexer/minimal";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { build, createServer, normalizePath, type Plugin, type ViteDevServer } from "vite";
import { build as standardBuild, type Plugin as StandardPlugin } from "vite-standard";
import anywidgetBundle, { type AnyWidgetBundleOptions } from "../src/index";

type Manifest = {
  version: number;
  entry: string;
  style: string | null;
  app: string;
  modules: string[];
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("anywidgetBundle", () => {
  test("builds a manifest-backed module graph and optional CSS", async () => {
    const fixture = await createFixture({
      "app.ts": `
        import "./style.css";
        export default async () => ({
          initialize: async () => undefined,
          render: async ({ el }) => {
            const lazy = await import("./lazy.ts");
            el.textContent = lazy.label;
          },
        });
      `,
      "lazy.ts": `export const label = "ready";`,
      "style.css": `.widget { background-image: url("./pixel.svg"); }`,
      "pixel.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`,
    });

    await buildFixture(fixture, {
      output: {
        entry: "esm/widget.mjs",
        app: "modules/main.mjs",
        style: "styles/widget.css",
      },
    });
    const manifest = await readManifest(fixture.outDir);

    expect(manifest).toMatchObject({
      version: 1,
      entry: "esm/widget.mjs",
      style: "styles/widget.css",
      app: "modules/main.mjs",
    });
    expect(manifest.modules[0]).toBe(manifest.app);
    expect(manifest.modules.length).toBeGreaterThan(1);
    expect(manifest.modules.slice(1)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^modules\/chunk-[A-Za-z0-9_-]+\.mjs$/)]),
    );
    expect(manifest.modules.slice(1).every((path) => !path.includes("lazy"))).toBe(true);
    await Promise.all(
      manifest.modules.map(async (path) => {
        expect((await stat(join(fixture.outDir, path))).isFile()).toBe(true);
      }),
    );

    const entry = await readFile(join(fixture.outDir, manifest.entry), "utf8");
    await init;
    expect(parse(entry, manifest.entry)[0].filter((record) => record.n !== undefined)).toEqual([]);
    expect(entry).toContain("anywidget-bundle:request");
    const css = await readFile(join(fixture.outDir, manifest.style ?? "missing"), "utf8");
    expect(css).toContain("data:image/svg+xml");

    const requests: { path?: unknown }[] = [];
    const controller = new AbortController();
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(entry).toString("base64")}#${Date.now()}`;
    const built = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: () => Promise<{
        initialize?(props: unknown): unknown;
      }>;
    };
    const definition = await built.default();
    const cleanup = definition.initialize?.({
      experimental: createExperimental(),
      model: createModel((content) => requests.push(content)),
      signal: controller.signal,
    });
    expect(cleanup).toEqual(expect.any(Function));
    await expect.poll(() => requests[0]?.path).toBe(manifest.app);
    controller.abort();
    if (typeof cleanup === "function") await cleanup();
  });

  test("records a CSS-free bundle explicitly", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { render() {} };`,
    });

    await buildFixture(fixture);

    expect(await readManifest(fixture.outDir)).toMatchObject({
      entry: "index.js",
      app: "chunks/app.js",
      style: null,
      modules: ["chunks/app.js"],
    });
  });

  test("removes stale CSS when Vite leaves the output directory intact", async () => {
    const fixture = await createFixture({
      "app.ts": `
        import "./style.css";
        export default { render: async () => import("./lazy.ts") };
      `,
      "lazy.ts": `export const value = 42;`,
      "style.css": `.widget { color: red; }`,
    });
    const config = {
      build: { emptyOutDir: false },
      configFile: false as const,
      logLevel: "silent" as const,
      plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.outDir })],
      root: fixture.root,
    };

    await build(config);
    const firstManifest = await readManifest(fixture.outDir);
    expect(firstManifest.style).toBe("widget.css");
    const staleChunk = firstManifest.modules.find((path) => path !== firstManifest.app);
    if (!staleChunk) throw new Error("Expected a split chunk in the first build.");
    expect((await stat(join(fixture.outDir, "widget.css"))).isFile()).toBe(true);
    expect((await stat(join(fixture.outDir, staleChunk))).isFile()).toBe(true);

    await writeFile(fixture.app, `export default { render() {} };`, "utf8");
    await build(config);

    expect(await readManifest(fixture.outDir)).toMatchObject({
      style: null,
      modules: ["chunks/app.js"],
    });
    await expect(stat(join(fixture.outDir, "widget.css"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(fixture.outDir, staleChunk))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("builds a virtual app module", async () => {
    const fixture = await createFixture({});
    const app = "virtual:fixture-app";

    await build({
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "fixture-app",
          resolveId(id) {
            if (id === app) return `\0${app}`;
          },
          load(id) {
            if (id === `\0${app}`) return `export default { render() {} };`;
          },
        },
        anywidgetBundle({ app, outDir: fixture.outDir }),
      ],
      root: fixture.root,
    });

    expect((await readManifest(fixture.outDir)).modules).toEqual(["chunks/app.js"]);
  });

  test("builds split imports with standard Vite", async () => {
    const fixture = await createFixture({
      "app.ts": `
        export default {
          async render({ el }) {
            const lazy = await import("./lazy.ts");
            el.textContent = lazy.label;
          },
        };
      `,
      "lazy.ts": `export const label = "standard-vite";`,
    });

    await standardBuild({
      configFile: false,
      logLevel: "silent",
      plugins: [
        anywidgetBundle({
          app: fixture.app,
          outDir: fixture.outDir,
        }) as unknown as StandardPlugin,
      ],
      root: fixture.root,
    });

    const manifest = await readManifest(fixture.outDir);
    expect(manifest.modules[0]).toBe("chunks/app.js");
    expect(manifest.modules.length).toBeGreaterThan(1);
  });

  test("rejects emitted files outside the JavaScript graph and widget stylesheet", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { render() {} };`,
    });

    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        plugins: [
          anywidgetBundle({ app: fixture.app, outDir: fixture.outDir }),
          {
            name: "fixture-extra-asset",
            generateBundle() {
              this.emitFile({ type: "asset", fileName: "extra.txt", source: "extra" });
            },
          },
        ],
        root: fixture.root,
      }),
    ).rejects.toThrow("Unsupported emitted anywidget bundle asset extra.txt");
  });

  test("rejects an output directory that could erase the Vite root", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { render() {} };`,
      "marker.txt": "keep",
    });

    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.root })],
        root: fixture.root,
      }),
    ).rejects.toThrow("outDir must not be the Vite root");
    expect(await readFile(join(fixture.root, "marker.txt"), "utf8")).toBe("keep");
  });

  test("rejects a resolved output directory that could erase the Vite root", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { render() {} };`,
      "marker.txt": "keep",
    });

    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        plugins: [
          anywidgetBundle({ app: fixture.app, outDir: fixture.outDir }),
          {
            name: "fixture-override-output",
            config() {
              return { build: { outDir: fixture.root } };
            },
          },
        ],
        root: fixture.root,
      }),
    ).rejects.toThrow("outDir must not be the Vite root");
    expect(await readFile(join(fixture.root, "marker.txt"), "utf8")).toBe("keep");
  });

  test("executes the configured app through the development entry", async () => {
    const fixture = await createFixture({
      "app.ts": `export default {
        initialize() { return () => undefined; },
        render({ el }) { el.textContent = "development"; return () => undefined; },
      };`,
    });
    const devEntry = "/@weather-widget/entry";
    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.outDir, devEntry })],
      root: fixture.root,
      server: { middlewareMode: true },
    });
    const modelController = new AbortController();
    const viewController = new AbortController();
    let disposeModel: (() => void | Promise<void>) | undefined;
    let disposeView: (() => void | Promise<void>) | undefined;
    try {
      const transformed = await server.transformRequest(`${devEntry}?anywidget`);
      expect(transformed?.code).toContain("/app.ts");
      expect(transformed?.code).toContain("default");
      expect(transformed?.code).toContain("/@vite/client");
      expect(transformed?.code).toContain("import.meta.hot.accept");
      expect(transformed?.code).toContain("entry.update");
      expect(transformed?.code).toContain("entry.dispose");

      const loaded = (await server.ssrLoadModule(`${devEntry}?anywidget`)) as {
        default: () => Promise<{
          initialize(props: unknown): unknown;
          render(props: unknown): unknown;
        }>;
      };
      const definition = await loaded.default();
      const model = createModel(() => {});
      const experimental = createExperimental();
      const initialized = await definition.initialize({
        model,
        signal: modelController.signal,
        experimental,
      });
      if (typeof initialized === "function") {
        disposeModel = initialized as () => void | Promise<void>;
      }
      const el = { textContent: "" };
      const rendered = await definition.render({
        model,
        el,
        signal: viewController.signal,
        experimental,
        host: createHost(model),
      });
      if (typeof rendered === "function") {
        disposeView = rendered as () => void | Promise<void>;
      }
      expect(el.textContent).toBe("development");
    } finally {
      try {
        try {
          await disposeView?.();
        } finally {
          await disposeModel?.();
        }
      } finally {
        viewController.abort();
        modelController.abort();
        await server.close();
      }
    }
  });

  test("serves an app resolved to a Vite virtual module", async () => {
    const fixture = await createFixture({});
    const devEntry = "/@virtual-widget/entry";
    const appSpecifier = "virtual:fixture-app";
    const appId = "\0virtual:fixture-app";
    const browserAppId = "/@id/__x00__virtual:fixture-app";
    const server = await createServer({
      configFile: false,
      root: fixture.root,
      plugins: [
        fixtureAppPlugin(appSpecifier, appId),
        anywidgetBundle({ app: appSpecifier, outDir: fixture.outDir, devEntry }),
      ],
      server: { middlewareMode: true },
    });

    try {
      expect(await developmentImportSpecifiers(server, devEntry)).toContain(browserAppId);
      const acceptedApp = await acceptedDevelopmentApp(server, devEntry);
      expect(acceptedApp.id).toBe(appId);
    } finally {
      await server.close();
    }
  });

  test("serves an app file outside the Vite root through /@fs/", async () => {
    const fixture = await createFixture({});
    const appRoot = await mkdtemp(join(tmpdir(), "anywidget-bundle-app-"));
    temporaryDirectories.push(appRoot);
    const app = join(appRoot, "app.ts");
    await writeFile(app, `export default { render() {} };`, "utf8");
    const devEntry = "/@outside-widget/entry";
    const server = await createServer({
      configFile: false,
      root: fixture.root,
      plugins: [anywidgetBundle({ app, outDir: fixture.outDir, devEntry })],
      server: {
        middlewareMode: true,
        fs: { allow: [fixture.root, appRoot] },
      },
    });

    try {
      const resolvedApp = await server.pluginContainer.resolveId(app);
      if (!resolvedApp) throw new Error(`Vite did not resolve ${app}.`);
      const browserAppId = `/@fs/${normalizePath(resolvedApp.id).replace(/^\/+/, "")}`;
      const acceptedApp = await acceptedDevelopmentApp(server, devEntry);
      expect(acceptedApp.id).toBe(resolvedApp.id);
      expect(acceptedApp.url).toBe(browserAppId);
    } finally {
      await server.close();
    }
  });

  test("serves an app resolved to an absolute Windows drive through /@fs/", async () => {
    const fixture = await createFixture({});
    const devEntry = "/@windows-widget/entry";
    const appSpecifier = "virtual:windows-app";
    const appId = "D:/shared/widgets/app.ts";
    const browserAppId = `/@fs/${appId}`;
    const server = await createServer({
      configFile: false,
      root: fixture.root,
      plugins: [
        fixtureAppPlugin(appSpecifier, appId),
        anywidgetBundle({ app: appSpecifier, outDir: fixture.outDir, devEntry }),
      ],
      server: { middlewareMode: true },
    });

    try {
      expect(await developmentImportSpecifiers(server, devEntry)).toContain(browserAppId);
      const acceptedApp = await acceptedDevelopmentApp(server, devEntry);
      expect(acceptedApp.id).toBe(appId);
    } finally {
      await server.close();
    }
  });

  test.each(["?", "#"])(
    "rejects a filesystem app path containing %s in build and development",
    async (delimiter) => {
      const appName = `app${delimiter}.ts`;
      const fixture = await createFixture({
        [appName]: `export default { render() {} };`,
      });
      const app = join(fixture.root, appName);
      const message = "app filesystem paths must not contain ? or #";

      await expect(
        build({
          configFile: false,
          root: fixture.root,
          logLevel: "silent",
          plugins: [anywidgetBundle({ app, outDir: fixture.outDir })],
        }),
      ).rejects.toThrow(message);

      const server = await createServer({
        configFile: false,
        root: fixture.root,
        logLevel: "silent",
        plugins: [anywidgetBundle({ app, outDir: fixture.outDir })],
        server: { middlewareMode: true },
      });
      try {
        await expect(server.transformRequest("/@anywidget-bundle/entry?anywidget")).rejects.toThrow(
          message,
        );
      } finally {
        await server.close();
      }
    },
  );

  test.each([
    [{ app: "", outDir: "dist" }, "app must be a non-empty"],
    [{ app: "app.ts", outDir: "" }, "outDir must be a non-empty"],
    [
      { app: "app.ts", devEntry: "/entry?widget", outDir: "dist" },
      "devEntry must be an absolute Vite path",
    ],
    [
      { app: "app.ts", devEntry: "/entry/", outDir: "dist" },
      "devEntry must be an absolute Vite path",
    ],
    [
      { app: "app.ts", devEntry: "/a//b", outDir: "dist" },
      "devEntry must be an absolute Vite path",
    ],
    [
      { app: "app.ts", devEntry: "/weather widget/entry", outDir: "dist" },
      "devEntry must be an absolute Vite path",
    ],
    [
      { app: "app.ts", devEntry: "/wëather/entry", outDir: "dist" },
      "devEntry must be an absolute Vite path",
    ],
    [{ app: "app.ts", outDir: "dist", output: null }, "output must be an object"],
  ])("rejects invalid options %#", (options, message) => {
    expect(() => anywidgetBundle(options as AnyWidgetBundleOptions)).toThrow(message);
  });
});

async function createFixture(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), "anywidget-bundle-"));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, source]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source, "utf8");
    }),
  );
  return { app: join(root, "app.ts"), outDir: join(root, "dist"), root };
}

async function buildFixture(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Pick<AnyWidgetBundleOptions, "devEntry" | "output"> = {},
): Promise<void> {
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.outDir, ...overrides })],
    root: fixture.root,
  });
}

async function readManifest(outDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(outDir, "anywidget.json"), "utf8")) as Manifest;
}

function createModel(send: (content: { path?: unknown }) => void): AnyModel {
  return {
    get() {
      return undefined;
    },
    off() {},
    on() {},
    save_changes() {},
    send,
    set() {},
    widget_manager: {
      async get_model<T extends Record<string, unknown>>(): Promise<AnyModel<T>> {
        return createModel(() => {}) as unknown as AnyModel<T>;
      },
    },
  };
}

function createExperimental(): Experimental {
  return {
    async invoke<T>(): Promise<[T, DataView[]]> {
      return [undefined as T, []];
    },
  };
}

function createHost(model: AnyModel): Host {
  return {
    async getModel() {
      return model;
    },
    async getWidget() {
      throw new Error("This fixture does not render child widgets.");
    },
  } as Host;
}

async function developmentImportSpecifiers(
  server: ViteDevServer,
  devEntry: string,
): Promise<(string | undefined)[]> {
  const resolved = await server.pluginContainer.resolveId(`${devEntry}?anywidget`);
  if (!resolved) throw new Error(`Vite did not resolve ${devEntry}.`);
  const loaded = await server.pluginContainer.load(resolved.id);
  const source = typeof loaded === "string" ? loaded : loaded?.code;
  if (typeof source !== "string") throw new Error(`Vite did not load ${devEntry}.`);
  await init;
  return parse(source)[0].map((record) => record.n);
}

async function acceptedDevelopmentApp(server: ViteDevServer, devEntry: string) {
  const url = `${devEntry}?anywidget`;
  const transformed = await server.transformRequest(url);
  if (!transformed) throw new Error(`Vite did not transform ${devEntry}.`);
  const entryModule = await server.moduleGraph.getModuleByUrl(url);
  const [acceptedApp] = entryModule?.acceptedHmrDeps ?? [];
  if (!acceptedApp) throw new Error(`Vite did not register an HMR dependency for ${devEntry}.`);
  if (!entryModule?.importedModules.has(acceptedApp)) {
    throw new Error(`The HMR dependency for ${devEntry} is not its imported app module.`);
  }
  return acceptedApp;
}

function fixtureAppPlugin(specifier: string, id: string): Plugin {
  return {
    name: `fixture-app:${specifier}`,
    resolveId(source) {
      if (source === specifier || source === id) return id;
    },
    load(resolvedId) {
      if (resolvedId === id) return `export default { render() {} };`;
    },
  };
}
