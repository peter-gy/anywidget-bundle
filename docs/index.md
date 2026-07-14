---
layout: home

hero:
  name: anywidget-bundle
  text: Build with Vite. Load from Python.
  tagline: One package name across npm and PyPI for self-contained anywidget frontends.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Vite API
      link: /vite

features:
  - title: AFM lifecycle
    details: The generated factory resolves the app before anywidget owns initialization, exports, rendering, and cleanup.
  - title: Fixed artifacts
    details: Production builds contain index.js and optional widget.css.
  - title: Python loader
    details: Bundle resolves the build while BundledWidget connects it to anywidget.AnyWidget.
---

Install the same project name in both ecosystems:

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```
