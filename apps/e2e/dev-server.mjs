import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../dist/e2e/consumer/", import.meta.url));

const { createServer, default: anywidgetBundle } = await import(
  new URL("../../dist/e2e/consumer/build.mjs", import.meta.url).href
);

const server = await createServer({
  configFile: false,
  root,
  plugins: [anywidgetBundle({ app: "./app.js", outDir: "src/e2e_widget/static" })],
  server: { host: "127.0.0.1", port: 27355, strictPort: true, cors: true },
});

await server.listen();

for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await server.close();
    process.exit();
  });
