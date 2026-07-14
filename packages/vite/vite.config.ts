import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      neverBundle: ["vite"],
    },
    dts: true,
    entry: ["src/index.ts", "src/build.ts", "src/app-entry.ts", "src/dev.ts"],
    format: ["esm"],
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
    sourcemap: true,
    target: "node20",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
