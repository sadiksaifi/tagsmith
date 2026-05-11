<script setup lang="ts">
import { withBase } from "vitepress";
import { onMounted, onUnmounted, ref } from "vue";

const isOpen = ref(false);
const copied = ref(false);
const menu = ref<HTMLElement>();
let copiedTimeout: ReturnType<typeof setTimeout> | undefined;

function getCurrentPageUrl(): string {
  return window.location.origin + window.location.pathname;
}

function getMarkdownPageUrl(): string {
  const { origin, pathname } = new URL(getCurrentPageUrl());
  const pathWithoutHtml = pathname.endsWith(".html") ? pathname.slice(0, -5) : pathname;

  if (pathWithoutHtml === "" || pathWithoutHtml === "/" || pathWithoutHtml === "/index") {
    return `${origin}/index.md`;
  }

  if (import.meta.env.DEV && pathWithoutHtml.endsWith("/")) {
    return `${origin}${pathWithoutHtml}index.md`;
  }

  if (pathWithoutHtml.endsWith("/index")) {
    return `${origin}${pathWithoutHtml.slice(0, -"/index".length)}.md`;
  }

  return `${origin}${pathWithoutHtml.replace(/\/+$/, "")}.md`;
}

function closeMenu(): void {
  isOpen.value = false;
}

function toggleMenu(): void {
  isOpen.value = !isOpen.value;
}

async function copyPage(): Promise<void> {
  const response = await fetch(getMarkdownPageUrl());
  const text = await response.text();

  await navigator.clipboard.writeText(text);
  copied.value = true;
  closeMenu();

  if (copiedTimeout) {
    clearTimeout(copiedTimeout);
  }

  copiedTimeout = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function viewAsMarkdown(): void {
  window.open(getMarkdownPageUrl(), "_blank", "noopener");
  closeMenu();
}

function openInChatGpt(): void {
  const prompt = `Read from ${getMarkdownPageUrl()} so I can ask questions about it.`;
  window.open(
    `https://chatgpt.com/?hints=search&prompt=${encodeURIComponent(prompt)}`,
    "_blank",
    "noopener",
  );
  closeMenu();
}

function openInClaude(): void {
  const prompt = `Read from ${getMarkdownPageUrl()} so I can ask questions about it.`;
  window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
  closeMenu();
}

function handleOutsideClick(event: MouseEvent): void {
  if (menu.value && !menu.value.contains(event.target as Node)) {
    closeMenu();
  }
}

onMounted(() => document.addEventListener("click", handleOutsideClick));
onUnmounted(() => {
  document.removeEventListener("click", handleOutsideClick);

  if (copiedTimeout) {
    clearTimeout(copiedTimeout);
  }
});
</script>

<template>
  <div class="tagsmith-page-actions" ref="menu">
    <div class="tagsmith-page-actions__trigger">
      <button class="tagsmith-page-actions__copy" type="button" @click="copyPage">
        <span
          class="tagsmith-page-actions__copy-icon"
          :class="{ 'is-copied': copied }"
          aria-hidden="true"
        ></span>
        <span>{{ copied ? "Copied" : "Copy Page" }}</span>
      </button>
      <button
        class="tagsmith-page-actions__toggle"
        type="button"
        aria-label="Open page actions"
        :aria-expanded="isOpen"
        :class="{ 'is-open': isOpen }"
        @click.stop="toggleMenu"
      >
        <span class="vpi-chevron-right tagsmith-page-actions__chevron" aria-hidden="true"></span>
      </button>
    </div>

    <div v-if="isOpen" class="tagsmith-page-actions__menu">
      <button type="button" @click="viewAsMarkdown">
        <span class="tagsmith-page-actions__menu-icon" aria-hidden="true">
          <img
            class="tagsmith-page-actions__theme-icon tagsmith-page-actions__theme-icon--light"
            :src="withBase('/icons/markdown-light.svg')"
            alt=""
          />
          <img
            class="tagsmith-page-actions__theme-icon tagsmith-page-actions__theme-icon--dark"
            :src="withBase('/icons/markdown-dark.svg')"
            alt=""
          />
        </span>
        <span>View as Markdown</span>
      </button>
      <button type="button" @click="openInChatGpt">
        <span class="tagsmith-page-actions__menu-icon" aria-hidden="true">
          <img
            class="tagsmith-page-actions__theme-icon tagsmith-page-actions__theme-icon--light"
            :src="withBase('/icons/openai.svg')"
            alt=""
          />
          <img
            class="tagsmith-page-actions__theme-icon tagsmith-page-actions__theme-icon--dark"
            :src="withBase('/icons/openai-dark.svg')"
            alt=""
          />
        </span>
        <span>Open in ChatGPT</span>
      </button>
      <button type="button" @click="openInClaude">
        <span class="tagsmith-page-actions__menu-icon" aria-hidden="true">
          <img :src="withBase('/icons/claude-ai-icon.svg')" alt="" />
        </span>
        <span>Open in Claude</span>
      </button>
    </div>
  </div>
</template>
