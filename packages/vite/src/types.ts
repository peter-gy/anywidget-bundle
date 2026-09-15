import type { AnyModel, InitializeProps, Render } from "@anywidget/types";

type Cleanup = () => void | Promise<void>;

export type AnyWidgetBundleInitialize<ModelState extends Record<string, unknown>> = (
  props: InitializeProps<ModelState>,
) => void | Cleanup | Promise<void | Cleanup>;

export type AnyWidgetBundleApp<ModelState extends Record<string, unknown>> =
  | {
      initialize: AnyWidgetBundleInitialize<ModelState>;
      render?: Render<ModelState>;
    }
  | {
      initialize?: AnyWidgetBundleInitialize<ModelState>;
      render: Render<ModelState>;
    };

export type AnyWidgetBundleAppModule<ModelState extends Record<string, unknown>> =
  | AnyWidgetBundleApp<ModelState>
  | (() => AnyWidgetBundleApp<ModelState> | Promise<AnyWidgetBundleApp<ModelState>>);

export type AnyWidgetBundleModel = Pick<AnyModel, "off" | "on" | "send">;
