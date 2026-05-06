import { defineConfig } from "tsup";

export default defineConfig({
  banner: {
    js: "#!/usr/bin/env node"
  },
  clean: true,
  dts: true,
  entry: ["src/cli.ts"],
  target: "node20",
  format: ["esm"]
});
