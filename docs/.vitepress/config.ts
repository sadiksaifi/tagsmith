import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "en-US",
  title: "Tagsmith",
  description: "Opinionated Git tag and SemVer release-tag manager.",
  base: "/tagsmith/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", href: "/tagsmith/favicon.ico" }]],
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/docs/", activeMatch: "^/docs/" },
      { text: "GitHub", link: "https://github.com/sadiksaifi/tagsmith" },
      {
        text: "llms.txt",
        link: "https://sadiksaifi.github.io/tagsmith/llms.txt",
        target: "_blank",
        rel: "noopener",
      },
    ],
    sidebar: {
      "/docs/": [
        {
          text: "Getting started",
          collapsed: false,
          items: [
            { text: "Overview", link: "/docs/" },
            { text: "Get started", link: "/docs/getting-started" },
            { text: "AI-assisted setup", link: "/docs/ai-assisted-setup" },
          ],
        },
        {
          text: "Concepts",
          collapsed: false,
          items: [
            { text: "Mental model", link: "/docs/concepts" },
            { text: "Tag patterns", link: "/docs/tag-patterns" },
            { text: "Versioning and bumps", link: "/docs/versioning" },
            { text: "Interactive flows", link: "/docs/interactive" },
          ],
        },
        {
          text: "Reference",
          collapsed: false,
          items: [
            { text: "Configuration", link: "/docs/configuration" },
            { text: "Preflight checks", link: "/docs/preflight" },
            { text: "Git safety model", link: "/docs/git-safety" },
            { text: "Output modes", link: "/docs/output" },
            { text: "Error catalogue", link: "/docs/errors" },
          ],
        },
        {
          text: "Commands",
          collapsed: false,
          items: [
            { text: "tagsmith init", link: "/docs/cli/init" },
            { text: "tagsmith tag", link: "/docs/cli/tag" },
            { text: "tagsmith validate", link: "/docs/cli/validate" },
            { text: "tagsmith targets", link: "/docs/cli/targets" },
          ],
        },
        {
          text: "Continuous integration",
          collapsed: false,
          items: [{ text: "GitHub Actions", link: "/docs/ci" }],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/sadiksaifi/tagsmith" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/sadiksaifi/tagsmith/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Sadik Saifi",
    },
  },
});
