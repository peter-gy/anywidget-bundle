---
layout: home

hero:
  name: anywidget-bundle
  text: Build with Vite. Load from Python.
  tagline: One package name across npm and PyPI for manifest-backed anywidget frontends.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Vite API
      link: /vite

features:
  - title: Split production build
    details: Vite emits a small index.js bootstrap, an anywidget.json manifest, and the application chunks.
  - title: Python module serving
    details: Bundle validates the manifest while BundledWidget serves allowlisted modules through custom messages.
  - title: Model-scoped loading
    details: The browser shares one module graph across a model's views and releases its listeners and object URLs during cleanup.
---

Install the same project name in both ecosystems:

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```
