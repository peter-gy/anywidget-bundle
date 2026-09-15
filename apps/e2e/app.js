import { token, payload } from "./shared.js";
import "./style.css";

export default () => ({
  async initialize({ model, signal }) {
    globalThis.bundleEvents ??= [];
    const name = model.get("label");

    if (model.get("fault") === "stall") {
      globalThis.bundleStalled = true;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));

      return () => globalThis.bundleEvents.push(`${name}:cleanup`);
    }

    signal.addEventListener("abort", () => globalThis.bundleEvents.push(`${name}:abort`), {
      once: true,
    });

    if (model.get("fault") === "initialize") throw new RangeError("fixture initialization failed");
    await new Promise((resolve) => {
      const reply = (message) => {
        if (message.type !== "fixture:pong") return;
        model.off("msg:custom", reply);
        resolve();
      };

      model.on("msg:custom", reply);
      signal.addEventListener("abort", () => model.off("msg:custom", reply), { once: true });
      model.send({ type: "fixture:ping" });
    });
    globalThis.bundleEvents.push(`${name}:initialize`);

    return () => globalThis.bundleEvents.push(`${name}:cleanup`);
  },
  render({ model, el, signal }) {
    if (model.get("fault") === "render") throw new Error("fixture render failed");
    const root = document.createElement("section");
    root.className = "bundle-fixture";
    root.dataset.token = token.id;
    root.dataset.label = model.get("label");
    root.dataset.bytes = String(payload.length);
    const label = document.createElement("strong");
    label.textContent = `${model.get("label")}: ready`;
    const button = document.createElement("button");
    button.textContent = "Load lazy module";
    button.addEventListener(
      "click",
      async () => {
        const lazy = await import("./lazy.js");
        button.textContent = `shared identity: ${lazy.token === token}`;
      },
      { signal },
    );
    root.append(label, button);
    el.replaceChildren(root);
    signal.addEventListener("abort", () => root.remove(), { once: true });

    return () => {
      globalThis.bundleEvents.push(`${model.get("label")}:view-cleanup`);
    };
  },
});
