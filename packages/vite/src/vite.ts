import { existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { ImportType, init, parse } from "es-module-lexer/minimal";
import { normalizePath, type Plugin, type UserConfig } from "vite";

export type AnyWidgetBundleOptions = {
  app: string;
  outDir: string;
  devEntry?: string;
};

type ResolvedOptions = Required<AnyWidgetBundleOptions>;

type ChunkInfo = {
  type: "chunk";
  fileName: string;
  imports: string[];
  dynamicImports: string[];
};

type AssetInfo = {
  type: "asset";
  fileName: string;
};

const DEFAULT_DEV_ENTRY = "/@anywidget-bundle/entry";
const BUILD_APP_ID = "virtual:anywidget-bundle/app";
const ENTRY_FILE = "index.js";
const STYLE_FILE = "widget.css";
const VITE_ID_PREFIX = "/@id/";
const VITE_NULL_BYTE = "__x00__";
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//;

export default function anywidgetBundle(rawOptions: AnyWidgetBundleOptions): Plugin {
  const options = resolveOptions(rawOptions);
  let command: "build" | "serve" = "build";
  let root = process.cwd();
  let outputDir = resolve(root, options.outDir);
  let appId = options.app;
  const resolvedDevEntryId = `\0virtual:anywidget-bundle/dev-entry:${options.devEntry}`;
  const developmentAppIds = new Map<string, string>();

  return {
    name: "anywidget-bundle",
    config(_config, environment) {
      command = environment.command;
      return environment.command === "build"
        ? buildConfig(options, runtimeSourcePath("build"))
        : undefined;
    },
    configResolved(config) {
      validateOutDir(config.root, options.outDir);
      root = config.root;
      outputDir = resolve(root, options.outDir);
    },
    async buildStart() {
      appId = await resolveAppImport(this, options.app);
      validateResolvedAppImport(appId);
    },
    resolveId(id) {
      if (id === BUILD_APP_ID) return appId;
      if (isDevelopmentEntryRequest(id, options.devEntry)) return resolvedDevEntryId;
      return developmentAppIds.get(id) ?? null;
    },
    async load(id) {
      if (id === runtimeSourcePath("build")) {
        return `export { default } from ${JSON.stringify(BUILD_APP_ID)};`;
      }
      if (id !== resolvedDevEntryId) return null;

      const resolved = await resolveAppImport(this, options.app);
      validateResolvedAppImport(resolved);
      const browserId = browserImport(resolved, root);
      developmentAppIds.clear();
      developmentAppIds.set(browserId, resolved);
      return `import "/@vite/client";
import app from ${JSON.stringify(browserId)};
if (import.meta.hot) import.meta.hot.accept(${JSON.stringify(browserId)}, () => window.location.reload());
export default app;`;
    },
    generateBundle: {
      order: "post",
      async handler(_output, bundle) {
        if (command !== "build") return;
        const chunks = Object.values(bundle).filter(
          (item): item is typeof item & ChunkInfo => item.type === "chunk",
        );
        const assets = Object.values(bundle).filter(
          (item): item is typeof item & AssetInfo => item.type === "asset",
        );

        if (chunks.length !== 1 || chunks[0]?.fileName !== ENTRY_FILE) {
          this.error(`anywidget bundle must emit exactly one ${ENTRY_FILE}.`);
        }
        for (const specifier of [...chunks[0].imports, ...chunks[0].dynamicImports]) {
          if (specifier !== ENTRY_FILE && !isWebImport(specifier)) {
            this.error(`anywidget bundle contains unresolved import ${specifier}.`);
          }
        }
        if (assets.length > 1 || (assets.length === 1 && assets[0]?.fileName !== STYLE_FILE)) {
          this.error(`anywidget bundle may emit ${ENTRY_FILE} and optional ${STYLE_FILE}.`);
        }

        await init;
        const [imports] = parse(chunks[0].code, ENTRY_FILE);
        for (const specifier of imports) {
          if (specifier.t === ImportType.ImportMeta) continue;
          if (specifier.t === ImportType.Dynamic && specifier.n === undefined) {
            continue;
          }
          if (specifier.n === undefined || !isWebImport(specifier.n)) {
            this.error(
              `anywidget bundle contains unresolved import ${specifier.n ?? "expression"}.`,
            );
          }
        }

        chunks[0].code = compressedEntry(chunks[0].code);
      },
    },
    async writeBundle(_output, bundle) {
      if (
        command === "build" &&
        !Object.values(bundle).some((item) => item.type === "asset" && item.fileName === STYLE_FILE)
      ) {
        await rm(join(outputDir, STYLE_FILE), { force: true });
      }
    },
  };
}

function buildConfig(options: ResolvedOptions, entry: string): UserConfig {
  return {
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      copyPublicDir: false,
      cssCodeSplit: false,
      lib: {
        cssFileName: "widget",
        entry,
        formats: ["es"],
      },
      outDir: options.outDir,
      rollupOptions: {
        output: {
          assetFileNames: STYLE_FILE,
          codeSplitting: false,
          entryFileNames: ENTRY_FILE,
        },
      },
      sourcemap: false,
      target: "es2022",
    },
  };
}

function compressedEntry(source: string): string {
  const payload = gzipSync(source, { level: 9 }).toString("base64");
  return `const payload=${JSON.stringify(payload)};
let modulePromise;
async function loadModule(){
  return modulePromise??=(async()=>{
    const binary=atob(payload);
    const bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const source=await new Response(stream).text();
    const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
    try{return await import(url);}finally{URL.revokeObjectURL(url);}
  })();
}
export default async function createWidget(){
  const module=await loadModule();
  if(!Object.hasOwn(module,"default"))throw new Error("anywidget bundle app must export a default widget definition.");
  const widget=module.default;
  return typeof widget==="function"?await widget():widget;
}
`;
}

function resolveOptions(options: AnyWidgetBundleOptions): ResolvedOptions {
  if (!isPlainObject(options)) throw new Error("anywidgetBundle options must be an object.");
  for (const key of Object.keys(options)) {
    if (key !== "app" && key !== "outDir" && key !== "devEntry") {
      throw new Error(`anywidgetBundle ${key} is not supported.`);
    }
  }
  if (typeof options.app !== "string" || options.app.length === 0) {
    throw new Error("anywidgetBundle app must be a non-empty Vite module ID.");
  }
  if (typeof options.outDir !== "string" || options.outDir.length === 0) {
    throw new Error("anywidgetBundle outDir must be a non-empty directory path.");
  }
  const devEntry = options.devEntry ?? DEFAULT_DEV_ENTRY;
  if (!isDevelopmentPath(devEntry)) {
    throw new Error(
      "anywidgetBundle devEntry must be an absolute Vite path without a query or fragment.",
    );
  }
  return { app: options.app, outDir: options.outDir, devEntry };
}

function validateOutDir(root: string, outDir: string): void {
  const canonicalRoot = canonicalPath(root);
  const canonicalOutDir = canonicalPath(resolve(root, outDir));
  const rootFromOutDir = relative(canonicalOutDir, canonicalRoot);
  if (
    rootFromOutDir === "" ||
    (rootFromOutDir !== ".." &&
      !rootFromOutDir.startsWith(`..${posix.sep}`) &&
      !rootFromOutDir.startsWith(`..${win32.sep}`) &&
      !isAbsolute(rootFromOutDir))
  ) {
    throw new Error("anywidgetBundle outDir must not be the Vite root or one of its ancestors.");
  }
}

function canonicalPath(path: string): string {
  const missing: string[] = [];
  let existing = resolve(path);
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return resolve(path);
    missing.unshift(basename(existing));
    existing = parent;
  }
  return resolve(realpathSync.native(existing), ...missing);
}

function isDevelopmentPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length > 1 &&
    !value.includes("?") &&
    !value.includes("#") &&
    !value.includes("%") &&
    !value.includes("\\") &&
    !value
      .slice(1)
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function resolveAppImport(
  context: { resolve: PluginContextResolve },
  app: string,
): Promise<string> {
  return (await context.resolve(app, undefined, { skipSelf: true }))?.id ?? app;
}

function validateResolvedAppImport(id: string): void {
  if (isAbsoluteFilePath(id) && (id.includes("?") || id.includes("#")) && existsSync(id)) {
    throw new Error("anywidgetBundle app filesystem paths must not contain ? or #.");
  }
}

type PluginContextResolve = (
  source: string,
  importer?: string,
  options?: { skipSelf?: boolean },
) => Promise<{ id: string } | null>;

function browserImport(id: string, root: string): string {
  const normalized = normalizePath(id);
  if (normalized.startsWith("\0")) {
    return `${VITE_ID_PREFIX}${normalized.replace("\0", VITE_NULL_BYTE)}`;
  }
  if (normalized.startsWith("/@fs/") || normalized.startsWith(VITE_ID_PREFIX)) {
    return normalized;
  }
  if (isAbsoluteFilePath(normalized)) {
    const relativePath = relativeToRoot(normalizePath(root), normalized);
    return relativePath === undefined
      ? `/@fs/${normalized.replace(/^\/+/, "")}`
      : `/${relativePath}`;
  }
  if (normalized.startsWith("/") || normalized.includes(":")) return normalized;
  return `/${normalized}`;
}

function isAbsoluteFilePath(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path);
}

function relativeToRoot(root: string, id: string): string | undefined {
  const path = WINDOWS_DRIVE_PATH.test(root) || WINDOWS_DRIVE_PATH.test(id) ? win32 : posix;
  if (!path.isAbsolute(root) || !path.isAbsolute(id)) return undefined;
  const relativePath = normalizePath(path.relative(root, id));
  if (path.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../")) {
    return undefined;
  }
  return relativePath;
}

function isDevelopmentEntryRequest(id: string, devEntry: string): boolean {
  return id === devEntry || id === `${devEntry}?anywidget`;
}

function isWebImport(specifier: string): boolean {
  return /^(?:https?:|data:)/.test(specifier);
}

function runtimeSourcePath(module: "build"): string {
  const sourcePath = fileURLToPath(import.meta.url);
  const extension = sourcePath.endsWith(".ts") ? ".ts" : ".js";
  return normalizePath(join(dirname(sourcePath), `${module}${extension}`));
}
