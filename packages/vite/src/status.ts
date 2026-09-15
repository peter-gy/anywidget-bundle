import type { AnyWidgetBundleModel } from "./types";

export function reportStatus(
  model: AnyWidgetBundleModel,
  state: "loading" | "ready" | "error" | "disposed",
  phase?: "load" | "initialize" | "render",
  cause?: unknown,
): void {
  const error =
    state === "error"
      ? {
          phase,
          name: cause instanceof Error ? cause.name : "Error",
          message: cause instanceof Error ? cause.message : String(cause),
          stack: cause instanceof Error ? (cause.stack ?? "") : "",
        }
      : undefined;

  if (error) console.error("Anywidget bundle lifecycle failed.", cause);

  try {
    const report = { type: "anywidget-bundle:status", version: 1, state };

    if (error) model.send({ ...report, error });
    else model.send(report);
  } catch (cause) {
    console.error("Could not report anywidget bundle status.", cause);
  }
}
