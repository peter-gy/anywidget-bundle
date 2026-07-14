import type { AnyWidget } from "../src/index";
import { describe, expect, test } from "vite-plus/test";

describe("AnyWidget export", () => {
  test("accepts every AFM module shape", () => {
    const definitions = [
      {},
      { initialize: () => ({ ready: true }) },
      { render: () => undefined },
      () => ({ render: () => undefined }),
      async () => ({ initialize: () => undefined }),
    ] satisfies AnyWidget[];

    expect(definitions).toHaveLength(5);
  });
});
