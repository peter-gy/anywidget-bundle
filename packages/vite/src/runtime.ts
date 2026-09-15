import type { AnyModel } from "@anywidget/types";

import type { AnyWidgetBundleAppModule, AnyWidgetBundleModel } from "./types";

import { createModuleLoader, type ModuleLoaderOptions } from "./module-loader";
import { createModuleReader, type ModuleReaderOptions } from "./protocol";
import { isAppDefinition } from "./guards";

type AnyWidgetBundleLoaderOptions = ModuleLoaderOptions & ModuleReaderOptions;

type BundleState = {
  signal: AbortSignal;
  load(path: string): Promise<object>;
};

// One model owns one reader and module graph. Sharing preserves ESM identity
// across its views, and the model signal owns transport and URL cleanup.
const states = new WeakMap<AnyWidgetBundleModel, BundleState>();

export async function loadAnyWidgetBundleApp<ModelState extends Record<string, unknown>>(
  model: AnyModel<ModelState>,
  path: string,
  signal: AbortSignal,
  options: AnyWidgetBundleLoaderOptions = {},
): Promise<AnyWidgetBundleAppModule<ModelState>> {
  if (signal.aborted) throw abortError();
  const state = stateFor(model, signal, options);
  const module = await state.load(path);

  if (!("default" in module))
    throw new Error("Anywidget bundle app module must have a default export.");
  const app = module.default;

  if (!isAppModule<ModelState>(app)) {
    throw new Error("Anywidget bundle module must export a widget definition.");
  }

  return app;
}

function stateFor(
  model: AnyWidgetBundleModel,
  signal: AbortSignal,
  options: AnyWidgetBundleLoaderOptions,
): BundleState {
  const existing = states.get(model);

  if (existing && !existing.signal.aborted) return existing;
  const reader = createModuleReader(model, signal, options);
  const loader = createModuleLoader(reader, signal, options);
  const state: BundleState = { signal, load: (path) => loader.import(path) };
  states.set(model, state);
  signal.addEventListener(
    "abort",
    () => {
      reader.dispose();
      loader.dispose();

      if (states.get(model) === state) states.delete(model);
    },
    { once: true },
  );

  return state;
}

function isAppModule<ModelState extends Record<string, unknown>>(
  value: unknown,
): value is AnyWidgetBundleAppModule<ModelState> {
  return typeof value === "function" || isAppDefinition<ModelState>(value);
}

function abortError(): DOMException {
  return new DOMException("Anywidget bundle module request aborted", "AbortError");
}

export type { AnyWidgetBundleApp, AnyWidgetBundleAppModule } from "./types";
