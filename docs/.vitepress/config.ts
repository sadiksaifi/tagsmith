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
      { text: "GitHub", link: "https://github.com/sadiksaifi/tagsmith" },
      { text: "llms.txt", link: "/llms.txt", target: "_blank" },
    ],
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
