# anywidget-bundle

The Vite plugin builds a self-contained anywidget AFM factory into `index.js` and optional `widget.css`.

```ts
import anywidgetBundle from "anywidget-bundle";

anywidgetBundle({ app: "./src/widget.ts", outDir: "./src/my_widget/static" });
```

[Read the documentation](https://peter-gy.github.io/anywidget-bundle/).
