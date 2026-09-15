declare global {
  interface Window {
    bundleUrls: Set<string>;
    bundleEvents: string[];
    bundleStalled?: boolean;
  }
}

type StartupMetrics = Record<string, { bytes: number; requests: number }>;

import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

async function openNotebook(page: Page, name: string) {
  await page.goto(`http://127.0.0.1:27354/lab/tree/${name}.ipynb`);
  await expect(page.getByRole("button", { name: "Bundle E2E | Idle", exact: true })).toBeVisible();
}

async function runCell(page: Page, source: string) {
  await page.getByRole("textbox").filter({ hasText: source }).click();
  await page.getByRole("button", { name: /Run this cell and advance/ }).click();
}

async function shutdown(page: Page) {
  await page.getByRole("menuitem", { name: "Kernel", exact: true }).click();
  await page.getByRole("menuitem", { name: /Shut Down Kernel/ }).click();
  await expect(page.getByRole("button", { name: "No Kernel", exact: true })).toBeVisible();
}

test("packed production graph preserves identity, loads lazily, and releases URLs", async ({
  page,
}, info) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await openNotebook(page, "production");
  await page.evaluate(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const active = new Set<string>();
    Object.assign(globalThis, { bundleUrls: active });
    URL.createObjectURL = (blob) => {
      const url = originalCreate(blob);

      if (blob instanceof Blob && blob.type === "text/javascript") active.add(url);

      return url;
    };

    URL.revokeObjectURL = (url) => {
      active.delete(url);
      originalRevoke(url);
    };
  });
  await runCell(page, "first = Widget");
  const views = page.locator(".bundle-fixture");
  await expect(views).toHaveCount(3);

  const tokens = await views.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-token")),
  );

  expect(tokens[0]).toBe(tokens[1]);
  expect(tokens[0]).not.toBe(tokens[2]);
  expect(await views.first().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
    "data:image/svg+xml",
  );
  await views.nth(0).getByRole("button").click();
  await views.nth(1).getByRole("button").click();
  await views.nth(2).getByRole("button").click();
  await expect(
    page.getByRole("button", { name: "shared identity: true", exact: true }),
  ).toHaveCount(3);
  await runCell(page, "assert first.bundle_status");
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "TRANSPORT" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("production.png"), fullPage: true });
  await runCell(page, "first.close()");
  await expect(views).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.bundleUrls.size)).toBe(0);
  expect(errors).toEqual([]);
  await shutdown(page);
});

test("Python receives original failures before the app diagnostic layer exists", async ({
  page,
}) => {
  await openNotebook(page, "failures");
  await runCell(page, "failures = [Widget");
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "FAILURES CREATED" }),
  ).toBeVisible();
  await runCell(page, "async def failed");
  const output = page.locator(".jp-OutputArea-output");
  await Promise.all(
    [
      "ERROR transport load",
      "ERROR evaluate load",
      "ERROR initialize initialize",
      "ERROR render render",
      "ERROR headless initialize",
    ].map((message) => expect(output.filter({ hasText: message })).toBeVisible()),
  );
  await runCell(page, 'print("FAILURES CLOSED")');
  await expect(output.filter({ hasText: "FAILURES CLOSED" })).toBeVisible();
  await shutdown(page);
});

test("Vite initialization receives Python replies and hot replacement cancels a stalled generation", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  const appPath = new URL("../../dist/e2e/consumer/app.js", import.meta.url);
  const source = await readFile(appPath, "utf8");

  try {
    await openNotebook(page, "development");
    await runCell(page, "live = DevWidget");
    await expect(page.locator('.bundle-fixture[data-label="live"]')).toBeVisible();
    await page.waitForFunction(() => window.bundleStalled);
    await writeFile(
      appPath,
      source.replace('model.get("fault") === "stall"', "false").replace(": ready", ": updated"),
    );
    await expect(page.getByText("stalled: updated", { exact: true })).toBeVisible();
    await expect(page.getByText("live: updated", { exact: true })).toBeVisible();

    const events = await page.evaluate(() => window.bundleEvents);

    expect(events.indexOf("stalled:cleanup")).toBeLessThan(events.indexOf("stalled:initialize"));
    expect(events.indexOf("live:cleanup")).toBeLessThan(events.lastIndexOf("live:initialize"));
    await runCell(page, "assert live.bundle_status");
    await expect(
      page.locator(".jp-OutputArea-output").filter({ hasText: "DEVELOPMENT READY" }),
    ).toBeVisible();
    await runCell(page, "live.close()");
    await expect(page.locator(".bundle-fixture")).toHaveCount(0);
    expect(errors).toEqual([]);
    await shutdown(page);
  } finally {
    await writeFile(appPath, source);
  }
});

test("1, 5, and 20 independent models retain lazy loading and isolated module state", async ({
  page,
}, info) => {
  await openNotebook(page, "scale");
  await runCell(page, "groups = {}");
  await expect(page.locator(".bundle-fixture")).toHaveCount(26);

  const tokens = await page
    .locator(".bundle-fixture")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-token")));

  expect(new Set(tokens).size).toBe(26);
  await runCell(page, "metrics = {}");
  const output = page.locator(".jp-OutputArea-output").filter({ hasText: "SCALE {" });
  await expect(output).toBeVisible();

  const metrics: StartupMetrics = JSON.parse((await output.innerText()).split("SCALE ")[1]!.trim());

  expect(metrics["5"]!.bytes).toBe(metrics["1"]!.bytes * 5);
  expect(metrics["20"]!.bytes).toBe(metrics["1"]!.bytes * 20);
  expect(metrics["20"]!.requests).toBe(metrics["1"]!.requests * 20);
  await info.attach("startup-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  await runCell(page, 'print("SCALE CLOSED")');
  await expect(page.locator(".bundle-fixture")).toHaveCount(0);
  await shutdown(page);
});
