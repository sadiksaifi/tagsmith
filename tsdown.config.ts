import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/cli.ts"],
  fixedExtension: false,
  format: "esm",
  minify: false,
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node22",
});
