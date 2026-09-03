import { chmod } from "node:fs/promises";
import path from "node:path";

import * as esbuild from "esbuild";

const outputRoot = process.env.FLINTMARK_OUT_DIR || "out";
const outfile = path.join(outputRoot, "zed", "flintmark-lsp.cjs");

await esbuild.build({
  entryPoints: ["src/zed/lsp.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile,
  minify: true,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
});
await chmod(outfile, 0o755);

console.log(`[esbuild] Zed language server -> ${outfile}`);
