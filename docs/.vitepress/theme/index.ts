import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";

import TagsmithPageActions from "./components/TagsmithPageActions.vue";

// oxlint-disable-next-line import/no-unassigned-import
import "./styles.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("TagsmithPageActions", TagsmithPageActions);
  },
} satisfies Theme;
