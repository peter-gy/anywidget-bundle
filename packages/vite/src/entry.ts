import type { AnyWidget } from "@anywidget/types";
import { createBundleLifecycle, type LoadApp } from "./lifecycle";

export function createAnyWidgetBundleEntry<ModelState extends Record<string, unknown>>(
  loadApp: LoadApp<ModelState>,
): AnyWidget<ModelState> {
  return createBundleLifecycle(loadApp).widget;
}
