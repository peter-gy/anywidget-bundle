import { defineConfig } from "vitepress";

const repository = "https://github.com/peter-gy/anywidget-bundle";
const basePath = process.env.BASE_PATH?.replace(/\/$/, "");

export default defineConfig({
  base: basePath ? `${basePath}/` : "/",
  cleanUrls: true,
  description: "Build self-contained anywidget modules with Vite and load them from Python.",
  lastUpdated: true,
  srcDir: "../../docs",
  themeConfig: {
    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Vite", link: "/vite" },
      { text: "Python", link: "/python" },
    ],
    search: { provider: "local" },
    sidebar: [
      {
        text: "anywidget-bundle",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting started", link: "/getting-started" },
          { text: "Vite API", link: "/vite" },
          { text: "Python API", link: "/python" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: repository }],
  },
  title: "anywidget-bundle",
});
