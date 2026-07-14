import { defineConfig } from "vite-plus";

const generated = ["**/dist/**", "**/node_modules/**", "**/.vitepress/cache/**"];

export default defineConfig({
  fmt: {
    ignorePatterns: generated,
    printWidth: 100,
    semi: true,
    useTabs: false,
  },
  lint: {
    categories: {
      correctness: "error",
      perf: "error",
    },
    ignorePatterns: generated,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["typescript", "unicorn", "import"],
    rules: {
      "typescript/unbound-method": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["packages/vite/src/**", "packages/vite/tests/**"],
        rules: {
          "vite-plus/prefer-vite-plus-imports": "off",
        },
      },
    ],
  },
  run: {
    cache: true,
  },
});
