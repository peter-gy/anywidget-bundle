import type { AnyWidgetBundleAppModule } from "./types";
import { createBundleLifecycle } from "./lifecycle";

export function createAnyWidgetBundleDevelopmentEntry<ModelState extends Record<string, unknown>>(
  app: AnyWidgetBundleAppModule<ModelState>,
) {
  const lifecycle = createBundleLifecycle<ModelState>(() => app);

  return {
    widget: lifecycle.widget,
    update: (next: AnyWidgetBundleAppModule<ModelState>) => lifecycle.update(() => next),
    dispose: lifecycle.dispose,
  };
}
