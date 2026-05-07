import { defineConfig } from "tsdown";

export default defineConfig({
  alias: {
    "@": "./src",
  },
  clean: true,
  dts: false,
  entry: ["src/cli.ts"],
  fixedExtension: false,
  format: "esm",
  minify: false,
  outDir: "dist",
  platform: "node",
  sourcemap: false,
  target: "node22",
});
