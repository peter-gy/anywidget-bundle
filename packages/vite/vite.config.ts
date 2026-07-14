import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      neverBundle: ["vite"],
    },
    dts: true,
    entry: ["src/index.ts", "src/build.ts"],
    format: ["esm"],
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
    platform: "node",
    sourcemap: true,
    target: "node20",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
