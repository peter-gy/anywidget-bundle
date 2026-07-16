---
layout: home

hero:
  name: anywidget-bundle
  text: Build with Vite. Load from Python.
  tagline: Keep the widget entry lean and serve Vite chunks from the installed Python wheel.
  actions:
    - theme: brand
      text: Get started
      link: ./getting-started
    - theme: alt
      text: Vite API
      link: ./vite

features:
  - title: Lean widget entry
    details: Vite emits a small index.js bootstrap for _esm and moves the application graph into separate chunks.
  - title: Wheel-packaged chunks
    details: Bundle validates anywidget.json and BundledWidget serves its allowlisted modules from the installed wheel.
  - title: Lifecycle-scoped loading
    details: Static modules load with the model, literal dynamic imports load when executed, and views share one model-scoped graph.
---

Install the Vite plugin and Python loader:

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```
