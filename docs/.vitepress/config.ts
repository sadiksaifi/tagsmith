import { defineConfig } from "vitepress";

const SITE_URL = "https://tagsmith.sadiksaifi.dev";
const SITE_TITLE = "Tagsmith";
const SITE_DESCRIPTION =
  "Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const OG_IMAGE_ALT = "Tagsmith — Opinionated Git tag and SemVer release-tag manager.";
const TWITTER_HANDLE = "@sadiksaifi";

export default defineConfig({
  lang: "en-US",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },
  head: [
    // Favicons
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" }],
    ["link", { rel: "shortcut icon", href: "/favicon.ico" }],

    // Theme color
    ["meta", { name: "theme-color", content: "#FFFFFF", media: "(prefers-color-scheme: light)" }],
    ["meta", { name: "theme-color", content: "#1B1B1F", media: "(prefers-color-scheme: dark)" }],

    // Generic SEO
    ["meta", { name: "author", content: "Sadik Saifi" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "git, tag, semver, release, cli, monorepo, conventional-commits, github-actions, prerelease, ci",
      },
    ],

    // OpenGraph (per-page title/description/url come from transformPageData)
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: SITE_TITLE }],
    ["meta", { property: "og:image", content: OG_IMAGE }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: OG_IMAGE_ALT }],
    ["meta", { property: "og:locale", content: "en_US" }],

    // Twitter card
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:site", content: TWITTER_HANDLE }],
    ["meta", { name: "twitter:creator", content: TWITTER_HANDLE }],
    ["meta", { name: "twitter:image", content: OG_IMAGE }],
    ["meta", { name: "twitter:image:alt", content: OG_IMAGE_ALT }],
  ],

  transformPageData(pageData) {
    const cleanPath = pageData.relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
    const canonicalUrl = cleanPath ? `${SITE_URL}/${cleanPath}` : `${SITE_URL}/`;

    const pageTitle = pageData.title ? `${pageData.title} | ${SITE_TITLE}` : SITE_TITLE;
    const pageDescription =
      pageData.description ||
      (pageData.frontmatter && pageData.frontmatter.description) ||
      SITE_DESCRIPTION;

    pageData.frontmatter ??= {};
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["meta", { property: "og:title", content: pageTitle }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:url", content: canonicalUrl }],
      ["meta", { name: "twitter:title", content: pageTitle }],
      ["meta", { name: "twitter:description", content: pageDescription }],
    );
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/docs/", activeMatch: "^/docs/" },
      { text: "GitHub", link: "https://github.com/sadiksaifi/tagsmith" },
      {
        text: "llms.txt",
        link: "https://tagsmith.sadiksaifi.dev/llms.txt",
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
