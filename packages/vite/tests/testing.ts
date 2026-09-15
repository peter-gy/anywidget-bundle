import { isCallable, isString, isObject } from "../src/guards";
import type { AnyModel, Experimental, Host, InitializeProps, RenderProps } from "@anywidget/types";

export type TestState = { _source?: string };

export type ModuleValue =
  | string
  | { error: { code: string; message: string } }
  | (() => string | { error: { code: string; message: string } });

type MessageHandler = Parameters<AnyModel<TestState>["on"]>[1];

type ModuleResponse = {
  type: string;
  version: number;
  id: string;
  path: string;
  error?: { code: string; message: string };
};

const experimental: Experimental = {
  async invoke() {
    throw new Error("This fixture does not invoke commands.");
  },
};

const host: Host = {
  async getModel(ref) {
    throw new Error(`Unknown widget model ${ref}`);
  },
  async getWidget() {
    throw new Error("Test host does not render child widgets");
  },
};

export function createModel(initial: Partial<TestState>): AnyModel<TestState> {
  const state = { ...initial };
  const listeners = new Map<string, Set<MessageHandler>>();

  return {
    get(name) {
      return state[name];
    },
    set(name, value) {
      state[name] = value;

      for (const listener of listeners.get(`change:${name}`) ?? []) listener();
    },
    save_changes() {},
    send() {},
    on(name: string, callback: MessageHandler) {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    off(name?: string | null, callback?: MessageHandler | null) {
      if (name == null) {
        listeners.clear();

        return;
      }

      if (callback == null) {
        listeners.delete(name);

        return;
      }

      listeners.get(name)?.delete(callback);
    },
    widget_manager: {
      async get_model() {
        throw new Error("This fixture has no child models.");
      },
    },
  };
}

export function initializeProps(
  model: InitializeProps<TestState>["model"],
  signal: AbortSignal,
): InitializeProps<TestState> {
  return { model, signal, experimental };
}

export function renderProps(
  model: RenderProps<TestState>["model"],
  el: HTMLElement,
  signal: AbortSignal,
): RenderProps<TestState> {
  return { model, el, signal, host, experimental };
}

export function respondingModel(
  modules: ReadonlyMap<string, ModuleValue>,
  options: {
    delays?: Readonly<Record<string, number>>;
    respond?: boolean;
    buffers?: DataView[];
    responsePath?: string;
  } = {},
) {
  const listeners = new Set<MessageHandler>();
  const requested: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const model: AnyModel<TestState> = {
    ...createModel({}),
    on(name: string, callback: MessageHandler) {
      if (name === "msg:custom") listeners.add(callback);
    },
    off(name?: string | null, callback?: MessageHandler | null) {
      if (name !== "msg:custom") return;

      if (callback) listeners.delete(callback);
      else listeners.clear();
    },
    send(content) {
      if (!isRequest(content)) return;
      requested.push(content.path);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      if (options.respond === false) return;
      globalThis.setTimeout(() => {
        inFlight -= 1;
        const configured = modules.get(content.path);
        const value = isCallable(configured) ? configured() : configured;

        if (isObject(value) && value !== null && "error" in value) {
          emit(
            {
              type: "anywidget-bundle:response",
              version: 1,
              id: content.id,
              path: content.path,
              error: value.error,
            },
            [],
          );

          return;
        }

        const source = isString(value) ? value : "";
        emit(
          {
            type: "anywidget-bundle:response",
            version: 1,
            id: content.id,
            path: options.responsePath ?? content.path,
          },
          options.buffers ?? [sourceBuffer(source)],
        );
      }, options.delays?.[content.path] ?? 0);
    },
  };

  function emit(message: ModuleResponse, buffers: DataView[]) {
    for (const listener of listeners) listener(message, buffers);
  }

  return {
    model,
    requested,
    get maxInFlight() {
      return maxInFlight;
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

export function sourceBuffer(source: string): DataView {
  const bytes = new TextEncoder().encode(source);

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function isRequest(value: unknown): value is { id: string; path: string } {
  if (value === null || !isObject(value)) return false;

  return (
    "type" in value &&
    value.type === "anywidget-bundle:request" &&
    "version" in value &&
    value.version === 1 &&
    "id" in value &&
    isString(value.id) &&
    "path" in value &&
    isString(value.path)
  );
}
