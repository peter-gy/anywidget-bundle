import { isCallable, isCleanup, isObject, isAppDefinition } from "./guards";
import type { AnyModel, AnyWidget, InitializeProps, RenderProps } from "@anywidget/types";

import type { AnyWidgetBundleApp, AnyWidgetBundleAppModule } from "./types";

import { reportStatus } from "./status";

export type LoadApp<ModelState extends Record<string, unknown>> = (
  model: AnyModel<ModelState>,
  signal: AbortSignal,
) => AnyWidgetBundleAppModule<ModelState> | Promise<AnyWidgetBundleAppModule<ModelState>>;

type Cleanup = () => void | Promise<void>;

class LifecycleCleanupError extends Error {
  constructor(readonly errors: readonly unknown[]) {
    super("Anywidget bundle lifecycle cleanup failed.");
    this.name = "LifecycleCleanupError";
  }
}

// Host signals own model and view lifetimes. Each generation signal owns one
// HMR app version, while operation promises serialize lifecycle callbacks.
type ViewState<ModelState extends Record<string, unknown>> = {
  props: RenderProps<ModelState>;
  controller: AbortController;
  cleanup?: Cleanup | undefined;
  cleanupOperation?: Promise<void> | undefined;
  operation: Promise<void>;
  disposal?: Promise<void> | undefined;
  disposed: boolean;
  onAbort: () => void;
};

type ModelLifecycle<ModelState extends Record<string, unknown>> = {
  props?: InitializeProps<ModelState> | undefined;
  controller: AbortController;
  app?: AnyWidgetBundleApp<ModelState> | undefined;
  initializeCleanup?: Cleanup | undefined;
  cleanupOperation?: Promise<void> | undefined;
  views: Set<ViewState<ModelState>>;
  generation: AbortController;
  operation: Promise<void>;
  disposal?: Promise<void> | undefined;
  disposed: boolean;
  onAbort?: (() => void) | undefined;
};

type InitializeResult<ModelState extends Record<string, unknown>> = Awaited<
  ReturnType<NonNullable<AnyWidgetBundleApp<ModelState>["initialize"]>>
>;

export type BundleLifecycle<ModelState extends Record<string, unknown>> = {
  widget: AnyWidget<ModelState>;
  update(loadApp: LoadApp<ModelState>): Promise<void>;
  dispose(): Promise<void>;
};

export function createBundleLifecycle<ModelState extends Record<string, unknown>>(
  initialApp: LoadApp<ModelState>,
): BundleLifecycle<ModelState> {
  let currentApp = initialApp;
  const models = new Set<ModelLifecycle<ModelState>>();

  const widget: AnyWidget<ModelState> = () => {
    const state: ModelLifecycle<ModelState> = {
      controller: new AbortController(),
      views: new Set(),
      generation: new AbortController(),
      operation: Promise.resolve(),
      disposed: false,
    };

    const initialize = (props: InitializeProps<ModelState>) => {
      if (state.props) throw new Error("Anywidget bundle initialized more than once.");
      props.signal.throwIfAborted();
      state.props = props;
      models.add(state);
      state.onAbort = () => ignoreAbortCleanupError(disposeModel(models, state));
      props.signal.addEventListener("abort", state.onAbort, { once: true });
      const generation = state.generation;
      const operation = runAfter(state.operation, () => startModel(state, currentApp, generation));
      state.operation = operation;
      // The host queues inbound messages until initialize returns. Application
      // readiness is owned here so initializers can await Python replies.
      void operation.catch(() => {});

      return () => disposeModel(models, state);
    };

    const render = async (props: RenderProps<ModelState>) => {
      if (!state.props) throw new Error("Anywidget bundle rendered before initialization.");
      await modelReady(state);

      if (state.disposed || props.signal.aborted) {
        return;
      }

      const view: ViewState<ModelState> = {
        props,
        controller: new AbortController(),
        operation: Promise.resolve(),
        disposed: false,
        onAbort: () => ignoreAbortCleanupError(disposeView(state, view)),
      };

      state.views.add(view);
      props.signal.addEventListener("abort", view.onAbort, { once: true });
      const operation = scheduleViewRender(state, view);

      try {
        await operation;
      } catch (error) {
        const aborted = view.props.signal.aborted || state.props.signal.aborted;
        const disposal = disposeView(state, view);

        if (aborted) {
          await disposal.catch(() => undefined);

          return;
        }

        await settleOperations([Promise.reject(error), disposal]);
      }

      return () => disposeView(state, view);
    };

    return { initialize, render };
  };

  return {
    widget,
    async update(loadApp) {
      const activeModels = [...models].filter((state) => !state.disposed);
      currentApp = loadApp;
      await settleOperations(
        activeModels.map((state) => {
          state.generation.abort();
          const generation = new AbortController();
          state.generation = generation;

          const operation = runAfter(state.operation, async () => {
            if (!isCurrent(state, generation)) return;
            await restartModel(state, loadApp, generation);
          });

          state.operation = operation;

          return operation;
        }),
      );
    },
    async dispose() {
      await settleOperations([...models].map((state) => disposeModel(models, state)));
    },
  };
}

async function startModel<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  loadApp: LoadApp<ModelState>,
  generation: AbortController,
): Promise<void> {
  const props = state.props;

  if (!props || !isCurrent(state, generation)) return;
  reportStatus(props.model, "loading");
  let app: AnyWidgetBundleApp<ModelState>;

  try {
    app = await instantiateAnyWidgetBundleApp(
      loadApp(
        props.model,
        AbortSignal.any([props.signal, state.controller.signal, generation.signal]),
      ),
    );
  } catch (error) {
    if (!isCurrent(state, generation)) return;
    reportStatus(props.model, "error", "load", error);
    generation.abort();
    throw error;
  }

  if (!isCurrent(state, generation)) return;
  state.app = app;
  let result: InitializeResult<ModelState>;

  try {
    result = await app.initialize?.({
      ...props,
      signal: AbortSignal.any([props.signal, state.controller.signal, generation.signal]),
    });

    if (result !== undefined && !isCleanup(result)) {
      throw new Error("Anywidget bundle initialize must return a cleanup function or nothing.");
    }
  } catch (error) {
    if (!isCurrent(state, generation)) return;
    reportStatus(props.model, "error", "initialize", error);
    generation.abort();
    throw error;
  }

  if (!isCurrent(state, generation)) {
    // A generation can end while initialization is settling. Preserve any late
    // cleanup for the final teardown pass.
    state.initializeCleanup = isCleanup(result) ? result : undefined;

    return;
  }

  state.initializeCleanup = isCleanup(result) ? result : undefined;
  reportStatus(props.model, "ready");
}

async function renderView<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  view: ViewState<ModelState>,
): Promise<void> {
  if (state.disposed || view.disposed || view.props.signal.aborted) return;
  const app = state.app;

  if (!app) throw new Error("Anywidget bundle rendered before initialization.");
  const generation = state.generation;
  view.controller = new AbortController();
  let cleanup: Awaited<ReturnType<NonNullable<typeof app.render>>>;

  try {
    cleanup = await app.render?.({
      ...view.props,
      signal: AbortSignal.any([
        view.props.signal,
        view.controller.signal,
        state.controller.signal,
        generation.signal,
      ]),
    });
  } catch (error) {
    if (!isViewCurrent(state, view, generation)) return;
    reportStatus(view.props.model, "error", "render", error);
    view.controller.abort();
    throw error;
  }

  view.cleanup = isCleanup(cleanup) ? cleanup : undefined;
}

async function restartModel<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  loadApp: LoadApp<ModelState>,
  generation: AbortController,
): Promise<void> {
  const props = state.props;

  if (!props || !isCurrent(state, generation)) return;
  state.app = undefined;
  const views = [...state.views].filter((view) => !view.disposed);
  // Views depend on initialized model state. Finish their cleanup before model
  // cleanup, then initialize the replacement before rerendering survivors.
  await settleTeardown(
    views.map((view) => settleViewGeneration(view)),
    () => cleanupModel(state),
  );

  if (state.disposed) return;
  await startModel(state, loadApp, generation);

  if (!isCurrent(state, generation)) return;
  await settleOperations(
    views.flatMap((view) => (view.disposed ? [] : [scheduleViewRender(state, view)])),
  );
}

function disposeModel<ModelState extends Record<string, unknown>>(
  models: Set<ModelLifecycle<ModelState>>,
  state: ModelLifecycle<ModelState>,
): Promise<void> {
  if (state.disposal) return state.disposal;
  state.disposed = true;
  state.generation.abort();
  state.app = undefined;

  if (state.props && state.onAbort) state.props.signal.removeEventListener("abort", state.onAbort);
  state.controller.abort();
  const operation = state.operation;
  const viewDisposals = [...state.views].map((view) => disposeView(state, view));
  const teardown = settleTeardown(viewDisposals, () => cleanupModel(state));

  const disposal = (async () => {
    try {
      await Promise.allSettled([operation]);
      const errors = await collectOperationErrors([teardown]);
      // Initialization may publish its cleanup after teardown first checked it.
      errors.push(...(await collectOperationErrors([cleanupModel(state)])));
      throwOperationErrors(errors);
    } finally {
      models.delete(state);

      if (state.props) reportStatus(state.props.model, "disposed");
    }
  })();

  state.disposal = disposal;

  return disposal;
}

function disposeView<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  view: ViewState<ModelState>,
): Promise<void> {
  if (view.disposal) return view.disposal;
  view.disposed = true;
  view.props.signal.removeEventListener("abort", view.onAbort);
  view.controller.abort();
  const operation = view.operation;

  const disposal = (async () => {
    try {
      await Promise.allSettled([operation]);
      await cleanupView(view);
    } finally {
      state.views.delete(view);
    }
  })();

  view.disposal = disposal;

  return disposal;
}

function cleanupView<ModelState extends Record<string, unknown>>(
  view: ViewState<ModelState>,
): Promise<void> {
  if (view.cleanupOperation) return view.cleanupOperation;
  const cleanup = view.cleanup;
  view.cleanup = undefined;
  let operation!: Promise<void>;
  operation = (async () => {
    try {
      await runCleanup(cleanup);
    } finally {
      if (view.cleanupOperation === operation) view.cleanupOperation = undefined;
    }
  })();
  view.cleanupOperation = operation;

  return operation;
}

function cleanupModel<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
): Promise<void> {
  if (state.cleanupOperation) return state.cleanupOperation;
  const cleanup = takeInitializeCleanup(state);
  let operation!: Promise<void>;
  operation = (async () => {
    try {
      await runCleanup(cleanup);
    } finally {
      if (state.cleanupOperation === operation) state.cleanupOperation = undefined;
    }
  })();
  state.cleanupOperation = operation;

  return operation;
}

async function settleViewGeneration<ModelState extends Record<string, unknown>>(
  view: ViewState<ModelState>,
): Promise<void> {
  await Promise.allSettled([view.operation]);
  await cleanupView(view);
}

function scheduleViewRender<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  view: ViewState<ModelState>,
): Promise<void> {
  const operation = runAfter(view.operation, () => renderView(state, view));
  view.operation = operation;

  return operation;
}

async function runCleanup(cleanup: Cleanup | undefined): Promise<void> {
  if (cleanup) await cleanup();
}

function takeInitializeCleanup<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
): Cleanup | undefined {
  const cleanup = state.initializeCleanup;
  state.initializeCleanup = undefined;

  return cleanup;
}

function ignoreAbortCleanupError(operation: Promise<void>): void {
  void operation.catch(() => undefined);
}

async function settleOperations(operations: readonly Promise<unknown>[]): Promise<void> {
  throwOperationErrors(await collectOperationErrors(operations));
}

async function settleTeardown(
  viewOperations: readonly Promise<unknown>[],
  cleanupInitialize: () => Promise<void>,
): Promise<void> {
  const errors = await collectOperationErrors(viewOperations);
  errors.push(...(await collectOperationErrors([cleanupInitialize()])));
  throwOperationErrors(errors);
}

async function collectOperationErrors(operations: readonly Promise<unknown>[]): Promise<unknown[]> {
  const results = await Promise.allSettled(operations);

  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

function throwOperationErrors(errors: readonly unknown[]): void {
  const uniqueErrors = [...new Set(errors)];

  if (uniqueErrors.length === 1) throw uniqueErrors[0];

  if (uniqueErrors.length > 1) throw new LifecycleCleanupError(uniqueErrors);
}

function isViewCurrent<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  view: ViewState<ModelState>,
  generation: AbortController,
): boolean {
  return isCurrent(state, generation) && !view.disposed && !view.props.signal.aborted;
}

function isCurrent<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
  generation: AbortController,
): boolean {
  return (
    state.generation === generation &&
    !state.disposed &&
    !generation.signal.aborted &&
    !state.props?.signal.aborted
  );
}

function runAfter(previous: Promise<void>, operation: () => Promise<void>): Promise<void> {
  // Run the next step after either outcome so cleanup and later HMR work still
  // reach the serialized queue.
  return previous.then(operation, operation);
}

async function modelReady<ModelState extends Record<string, unknown>>(
  state: ModelLifecycle<ModelState>,
): Promise<void> {
  const operation = state.operation;

  try {
    await operation;
  } catch (error) {
    if (operation === state.operation && !state.disposed) throw error;
  }

  if (operation !== state.operation) await modelReady(state);
}

export async function instantiateAnyWidgetBundleApp<ModelState extends Record<string, unknown>>(
  loaded: AnyWidgetBundleAppModule<ModelState> | Promise<AnyWidgetBundleAppModule<ModelState>>,
): Promise<AnyWidgetBundleApp<ModelState>> {
  const module = await loaded;
  const app = isCallable(module) ? await module() : module;

  if (!isObject(app)) {
    throw new Error("Anywidget bundle module must export a widget definition.");
  }

  const candidate = app;

  if (
    "initialize" in candidate &&
    candidate.initialize !== undefined &&
    !isCallable(candidate.initialize)
  ) {
    throw new Error("Anywidget bundle initialize must be a function.");
  }

  if ("render" in candidate && candidate.render !== undefined && !isCallable(candidate.render)) {
    throw new Error("Anywidget bundle render must be a function.");
  }

  if (
    !("initialize" in candidate && candidate.initialize !== undefined) &&
    !("render" in candidate && candidate.render !== undefined)
  ) {
    throw new Error("Anywidget bundle definition must provide initialize or render.");
  }

  if (!isAppDefinition<ModelState>(app)) throw new Error("Invalid anywidget bundle definition.");

  return app;
}
