import type { AnyWidgetBundleApp } from "./types";

export function isCallable<Value>(
  value: Value,
): value is Extract<Value, (...args: never[]) => void> {
  return typeof value === "function";
}

export function isString<Value>(value: Value): value is Value & string {
  return typeof value === "string";
}

export function isObject<Value>(value: Value): value is Value & object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCleanup(value: unknown): value is () => void | Promise<void> {
  return isCallable(value);
}

export function isAppDefinition<ModelState extends Record<string, unknown>>(
  value: unknown,
): value is AnyWidgetBundleApp<ModelState> {
  if (!isObject(value)) return false;
  const initialize = "initialize" in value ? value.initialize : undefined;
  const render = "render" in value ? value.render : undefined;

  return (
    (initialize === undefined || isCallable(initialize)) &&
    (render === undefined || isCallable(render)) &&
    (isCallable(initialize) || isCallable(render))
  );
}
