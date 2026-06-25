import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type HeadConfig, type PageData } from "vitepress";
import { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";
import llmstxt from "vitepress-plugin-llms";

const SITE_URL = "https://tagsmith.sadiksaifi.dev";
const SITE_TITLE = "Tagsmith";
const SITE_DESCRIPTION =
  "Opinionated Git tag and SemVer release-tag manager for single-target repositories and monorepos.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const TWITTER_IMAGE = `${SITE_URL}/twitter-image.png`;
const SOCIAL_IMAGE_ALT = "Tagsmith — Opinionated Git tag and SemVer release-tag manager.";
const TWITTER_HANDLE = "@sadiksaifi";
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCHEMA_SOURCE_PATH = join(REPO_ROOT, "schema/v1.json");

function getCleanPath(relativePath: string): string {
  return relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
}

function getCanonicalUrl(pageData: PageData): string {
  const cleanPath = getCleanPath(pageData.relativePath);
  return cleanPath ? `${SITE_URL}/${cleanPath}` : `${SITE_URL}/`;
}

function getPageTitle(pageData: PageData): string {
  return pageData.relativePath === "index.md"
    ? pageData.title
    : `${pageData.title} | ${SITE_TITLE}`;
}

function getPageDescription(pageData: PageData): string {
  return pageData.description || SITE_DESCRIPTION;
}

function jsonLd(data: Record<string, unknown>): HeadConfig {
  return ["script", { type: "application/ld+json" }, JSON.stringify(data)];
}

function createStructuredData(pageData: PageData, canonicalUrl: string): HeadConfig[] {
  const isHome = pageData.relativePath === "index.md";
  const isDocsPage = pageData.relativePath.startsWith("docs/");

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_TITLE,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: {
      "@type": "Person",
      name: "Sadik Saifi",
    },
  };

  if (isHome) {
    return [
      jsonLd(website),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_TITLE,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Node.js",
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        codeRepository: "https://github.com/sadiksaifi/tagsmith",
        license: "https://github.com/sadiksaifi/tagsmith/blob/main/LICENSE",
      }),
    ];
  }

  if (!isDocsPage) {
    return [jsonLd(website)];
  }

  return [
    jsonLd({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: pageData.title,
      description: getPageDescription(pageData),
      url: canonicalUrl,
      mainEntityOfPage: canonicalUrl,
      author: {
        "@type": "Person",
        name: "Sadik Saifi",
      },
      publisher: {
        "@type": "Person",
        name: "Sadik Saifi",
      },
      about: SITE_TITLE,
    }),
    jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_TITLE,
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Docs",
          item: `${SITE_URL}/docs/`,
        },
        ...(pageData.relativePath === "docs/index.md"
          ? []
          : [
              {
                "@type": "ListItem",
                position: 3,
                name: pageData.title,
                item: canonicalUrl,
              },
            ]),
      ],
    }),
  ];
}

export default defineConfig({
  lang: "en-US",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },
  vite: {
    plugins: [
      llmstxt({
        domain: SITE_URL,
      }),
    ],
  },
  markdown: {
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons, "TagsmithPageActions");
    },
  },
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

    // LLM-friendly documentation discovery
    ["link", { rel: "alternate", type: "text/plain", title: "llms.txt", href: "/llms.txt" }],
    [
      "link",
      { rel: "alternate", type: "text/plain", title: "llms-full.txt", href: "/llms-full.txt" },
    ],

    // OpenGraph (1200x630, 1.91:1; per-page title/description/url come from transformHead)
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: SITE_TITLE }],
    ["meta", { property: "og:image", content: OG_IMAGE }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: SOCIAL_IMAGE_ALT }],
    ["meta", { property: "og:locale", content: "en_US" }],

    // Twitter card (1200x600, 2:1 for summary_large_image)
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:site", content: TWITTER_HANDLE }],
    ["meta", { name: "twitter:creator", content: TWITTER_HANDLE }],
    ["meta", { name: "twitter:image", content: TWITTER_IMAGE }],
    ["meta", { name: "twitter:image:alt", content: SOCIAL_IMAGE_ALT }],
  ],

  async buildEnd(siteConfig) {
    const schemaOutputPath = join(siteConfig.outDir, "schema/v1.json");

    await mkdir(dirname(schemaOutputPath), { recursive: true });
    await copyFile(SCHEMA_SOURCE_PATH, schemaOutputPath);
  },

  transformHead({ pageData }) {
    if (pageData.isNotFound) {
      return [["meta", { name: "robots", content: "noindex" }]];
    }

    const canonicalUrl = getCanonicalUrl(pageData);
    const pageTitle = getPageTitle(pageData);
    const pageDescription = getPageDescription(pageData);

    return [
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["meta", { property: "og:title", content: pageTitle }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:url", content: canonicalUrl }],
      ["meta", { name: "twitter:title", content: pageTitle }],
      ["meta", { name: "twitter:description", content: pageDescription }],
      ...createStructuredData(pageData, canonicalUrl),
    ];
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/docs/", activeMatch: "^/docs/" },
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
            { text: "Setup with AI", link: "/docs/setup-with-ai" },
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
            { text: "tagsmith list", link: "/docs/cli/list" },
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
    socialLinks: [
      { icon: "github", link: "https://github.com/sadiksaifi/tagsmith" },
      { icon: "npm", link: "https://www.npmjs.com/package/tagsmith", ariaLabel: "npm" },
    ],
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
