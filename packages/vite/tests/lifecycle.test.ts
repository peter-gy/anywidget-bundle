import { isCallable } from "../src/guards";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createAnyWidgetBundleEntry } from "../src/entry";
import { createAnyWidgetBundleDevelopmentEntry } from "../src/dev";
import type { AnyWidgetBundleAppModule } from "../src/types";
import { createModel, initializeProps, renderProps, type TestState } from "./testing";

afterEach(() => vi.restoreAllMocks());

describe.each(["production", "development"] as const)("%s lifecycle", (mode) => {
  const entry = (app: AnyWidgetBundleAppModule<TestState>) =>
    mode === "production"
      ? createAnyWidgetBundleEntry<TestState>(() => app)
      : createAnyWidgetBundleDevelopmentEntry(app).widget;

  test("releases host replies before waiting for application initialization", async () => {
    const model = createModel({});
    let respond!: () => void;

    const reply = new Promise<void>((resolve) => {
      respond = resolve;
    });

    const widget = entry({
      async initialize() {
        await reply;
      },
      render({ el }) {
        el.textContent = "ready";
      },
    });

    const app = isCallable(widget) ? await widget() : widget;
    const props = initializeProps(model, new AbortController().signal);
    const cleanup = app.initialize?.(props);
    expect(cleanup).toEqual(expect.any(Function));
    respond();
    const el = document.createElement("div");
    await app.render?.(renderProps(model, el, props.signal));
    expect(el.textContent).toBe("ready");

    if (isCallable(cleanup)) await cleanup();
  });

  test("reports initialization failure without a view and aborts its resources", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const model = createModel({});
    const send = vi.spyOn(model, "send");
    const released = vi.fn();
    const failure = new RangeError("invalid model");

    const widget = entry({
      initialize({ signal }) {
        signal.addEventListener("abort", released, { once: true });
        throw failure;
      },
    });

    const app = isCallable(widget) ? await widget() : widget;
    const props = initializeProps(model, new AbortController().signal);
    const cleanup = app.initialize?.(props);
    await vi.waitFor(() => expect(released).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "anywidget-bundle:status",
        state: "error",
        error: expect.objectContaining({
          phase: "initialize",
          name: "RangeError",
          message: "invalid model",
        }),
      }),
    );
    await expect(
      app.render?.(renderProps(model, document.createElement("div"), props.signal)),
    ).rejects.toBe(failure);

    if (isCallable(cleanup)) await cleanup();
    expect(released).toHaveBeenCalledOnce();
  });

  test("aborts a failed render while preserving another view", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const released = vi.fn();

    const widget = entry({
      render({ el, signal }) {
        signal.addEventListener("abort", released, { once: true });

        if (el.dataset.fail) throw new Error("view failed");
        el.textContent = "live";
      },
    });

    const app = isCallable(widget) ? await widget() : widget;
    const model = createModel({});
    const signal = new AbortController().signal;
    const cleanup = app.initialize?.(initializeProps(model, signal));
    const live = document.createElement("div");
    await app.render?.(renderProps(model, live, signal));
    const failed = document.createElement("div");
    failed.dataset.fail = "true";
    await expect(app.render?.(renderProps(model, failed, signal))).rejects.toThrow("view failed");
    expect(released).toHaveBeenCalledOnce();
    expect(live.textContent).toBe("live");

    if (isCallable(cleanup)) await cleanup();
    expect(released).toHaveBeenCalledTimes(2);
  });
});

test("hot updates cancel pending initialization and finish late cleanup before replacement", async () => {
  let started!: () => void;

  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });

  const events: string[] = [];

  const entry = createAnyWidgetBundleDevelopmentEntry<TestState>({
    async initialize({ signal }) {
      started();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );

      return () => {
        events.push("cleanup");
      };
    },
  });

  const app = isCallable(entry.widget) ? await entry.widget() : entry.widget;
  const model = createModel({});
  void app.initialize?.(initializeProps(model, new AbortController().signal));
  const el = document.createElement("div");
  const rendering = app.render?.(renderProps(model, el, new AbortController().signal));
  await pending;
  const skipped = vi.fn();
  const first = entry.update({ initialize: skipped });

  const latest = entry.update({
    initialize() {
      events.push("initialize");
    },
    render({ el }) {
      el.textContent = "replacement";
    },
  });

  await Promise.all([first, latest, rendering]);
  expect(skipped).not.toHaveBeenCalled();
  expect(events).toEqual(["cleanup", "initialize"]);
  expect(el.textContent).toBe("replacement");
  await entry.dispose();
});
