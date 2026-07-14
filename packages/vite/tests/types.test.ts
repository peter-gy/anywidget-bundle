import type { AnyWidgetBundleAppModule } from "../src/index";
import { describe, expect, test } from "vite-plus/test";

describe("AnyWidgetBundleAppModule export", () => {
  test("accepts the supported bundle app shapes", () => {
    const definitions = [
      { initialize: () => undefined },
      { initialize: () => () => undefined },
      { render: () => undefined },
      () => ({ render: () => undefined }),
      async () => ({ initialize: () => undefined }),
    ] satisfies AnyWidgetBundleAppModule[];

    expect(definitions).toHaveLength(5);
  });

  test("rejects definitions outside the bundle lifecycle contract", () => {
    // @ts-expect-error A bundle app must provide initialize or render.
    const empty: AnyWidgetBundleAppModule = {};
    const exportsObject: AnyWidgetBundleAppModule = {
      // @ts-expect-error Bundle initialization cannot publish AFM exports.
      initialize: () => ({ ready: true }),
    };

    expect([empty, exportsObject]).toHaveLength(2);
  });
});
