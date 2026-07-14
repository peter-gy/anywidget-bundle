import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import type { AnyModel, AnyWidget, Experimental, Host, Initialize, Render } from "@anywidget/types";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { build, createServer } from "vite";
import { build as standardBuild, type Plugin as StandardPlugin } from "vite-standard";
import anywidgetBundle, { type AnyWidgetBundleOptions } from "../src/index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("anywidgetBundle", () => {
  test("builds one AFM module and optional CSS", async () => {
    const fixture = await createFixture({
      "app.ts": `
        import "./style.css";
        const shared = { ready: true };
        export default async () => ({
          initialize: async () => shared,
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

    await buildFixture(fixture);

    expect((await readdir(fixture.outDir)).sort()).toEqual(["index.js", "widget.css"]);
    const javascript = await readFile(join(fixture.outDir, "index.js"), "utf8");
    expect(javascript).not.toMatch(/(?:from\s*|import\s*\()["']\.\//);
    const css = await readFile(join(fixture.outDir, "widget.css"), "utf8");
    expect(css).toContain("data:image/svg+xml");

    const definition = await loadDefinition(join(fixture.outDir, "index.js"));
    const exports = await definition.initialize?.({
      experimental: createExperimental(),
      model: createModel(),
      signal: new AbortController().signal,
    });
    const el = { textContent: "" } as HTMLElement;
    await definition.render?.({
      el,
      experimental: createExperimental(),
      host: createHost(),
      model: createModel(),
      signal: new AbortController().signal,
    });

    expect(exports).toEqual({ ready: true });
    expect(el.textContent).toBe("ready");
  });

  test("loads an initialize-only AFM object", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { initialize: () => ({ answer: 42 }) };`,
    });

    await buildFixture(fixture);

    expect(await readdir(fixture.outDir)).toEqual(["index.js"]);
    const definition = await loadDefinition(join(fixture.outDir, "index.js"));
    expect(
      await definition.initialize?.({
        experimental: createExperimental(),
        model: createModel(),
        signal: new AbortController().signal,
      }),
    ).toEqual({ answer: 42 });
  });

  test("removes stale CSS when Vite leaves the output directory intact", async () => {
    const fixture = await createFixture({
      "app.ts": `import "./style.css"; export default { render() {} };`,
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
    expect((await readdir(fixture.outDir)).sort()).toEqual(["index.js", "widget.css"]);

    await writeFile(fixture.app, `export default { render() {} };`, "utf8");
    await build(config);

    expect(await readdir(fixture.outDir)).toEqual(["index.js"]);
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

    expect(await readdir(fixture.outDir)).toEqual(["index.js"]);
  });

  test("inlines dynamic imports with standard Vite", async () => {
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

    expect(await readdir(fixture.outDir)).toEqual(["index.js"]);
    const definition = await loadDefinition(join(fixture.outDir, "index.js"));
    const el = { textContent: "" } as HTMLElement;
    await definition.render?.({
      el,
      experimental: createExperimental(),
      host: createHost(),
      model: createModel(),
      signal: new AbortController().signal,
    });
    expect(el.textContent).toBe("standard-vite");
  });

  test("rejects a relative dynamic import at the Blob module boundary", async () => {
    const fixture = await createFixture({
      "app.ts": `
        const path = "./lazy.ts";
        export default { render: async () => import(path) };
      `,
      "lazy.ts": `export const value = 42;`,
    });

    await expect(buildFixture(fixture)).rejects.toThrow("unresolved import ./lazy.ts");
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

  test("serves the configured app from the development entry", async () => {
    const fixture = await createFixture({
      "app.ts": `export default { render() {} };`,
    });
    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.outDir })],
      root: fixture.root,
      server: { middlewareMode: true },
    });
    try {
      const transformed = await server.transformRequest("/@anywidget-bundle/entry?anywidget");
      expect(transformed?.code).toContain("/app.ts");
      expect(transformed?.code).toContain("default");
      expect(transformed?.code).toContain("/@vite/client");
      expect(transformed?.code).toContain("import.meta.hot.accept");
      expect(transformed?.code).toContain("window.location.reload");
    } finally {
      await server.close();
    }
  });

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
    [{ app: "app.ts", outDir: "dist", output: {} }, "output is not supported"],
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

async function buildFixture(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<void> {
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [anywidgetBundle({ app: fixture.app, outDir: fixture.outDir })],
    root: fixture.root,
  });
}

async function importFresh(path: string): Promise<unknown> {
  return import(`${pathToFileURL(path).href}?t=${Date.now()}`);
}

type WidgetDefinition = {
  initialize?: Initialize;
  render?: Render;
};

async function loadDefinition(path: string): Promise<WidgetDefinition> {
  const entry = await readFile(path, "utf8");
  const match = /^const payload=("[A-Za-z0-9+/=]+")/u.exec(entry);
  if (!match?.[1]) throw new Error("Expected a compressed bundle payload.");
  const source = gunzipSync(Buffer.from(JSON.parse(match[1]) as string, "base64")).toString("utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  let createdBlob: Blob | undefined;
  let revoked = false;
  URL.createObjectURL = (blob) => {
    if (!(blob instanceof Blob)) throw new Error("Expected a JavaScript Blob.");
    createdBlob = blob;
    return moduleUrl;
  };
  URL.revokeObjectURL = () => {
    revoked = true;
  };
  try {
    const module = (await importFresh(path)) as { default: AnyWidget };
    expect(typeof module.default).toBe("function");
    if (typeof module.default !== "function") throw new Error("Expected an AFM factory.");
    const definition = await module.default();
    expect(createdBlob).toBeDefined();
    expect(await createdBlob?.text()).toBe(source);
    expect(revoked).toBe(true);
    return definition;
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
}

function createModel(): AnyModel {
  return {
    get() {
      return undefined;
    },
    off() {},
    on() {},
    save_changes() {},
    send() {},
    set() {},
    widget_manager: {
      async get_model<T extends Record<string, unknown>>(): Promise<AnyModel<T>> {
        return createModel() as unknown as AnyModel<T>;
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

function createHost(): Host {
  return {
    async getModel<T extends Record<string, unknown>>(): Promise<AnyModel<T>> {
      return createModel() as unknown as AnyModel<T>;
    },
    async getWidget() {
      throw new Error("No child widget in this fixture.");
    },
  };
}
