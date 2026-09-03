// Runs every pure-logic test (test/**/*.test.ts, excluding integration/perf) in
// Node: bundles each with esbuild then executes it in an isolated process so a
// process.exit in one file doesn't stop the others. The bottom of docs/05.
//
// It captures each file's output (still teed to the console) so it can QUANTIFY
// the run — test-file count, passed/failed case counts, per-file + total wall
// time — and, for a FULL run (no args), writes out/metrics/unit.json for the
// consolidated test report (scripts/test-report.mjs).
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      // `integration` needs the VS Code harness; `perf` is an on-demand
      // benchmark (run via `npm run test:perf`), not a per-push gate.
      if (entry !== "integration" && entry !== "perf") walk(p, acc);
    } else if (p.endsWith(".test.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

// Args may be dirs OR individual .test.ts files: `run-unit.mjs test/chaos` for the
// heavy chaos run, or specific files for a focused mutation command. No args =>
// walk all of test/ for `test:unit`.
const roots = process.argv.slice(2);
const isFullRun = roots.length === 0;
const outputRoot = process.env.FLINTMARK_OUT_DIR || "out";
const files = [];
if (roots.length === 0) {
  walk("test", files);
} else {
  for (const r of roots) {
    if (statSync(r).isDirectory()) walk(r, files);
    else if (r.endsWith(".test.ts")) files.push(r);
  }
}
if (files.length === 0) {
  console.log(`No unit tests found in: ${roots.join(", ") || "test"}.`);
  process.exit(0);
}

mkdirSync(join(outputRoot, "test-unit"), { recursive: true });

let failed = 0;
let totalCases = 0;
let totalFailedCases = 0;
const fileMetrics = [];
const t0 = Date.now();
for (const f of files) {
  const outfile = join(
    join(outputRoot, "test-unit"),
    f.replace(/[/\\]/g, "__").replace(/\.ts$/, ".cjs")
  );
  await build({
    entryPoints: [f],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    sourcemap: "inline",
    logLevel: "warning",
  });
  console.log(`\n• ${f}`);
  const ft0 = Date.now();
  const r = spawnSync(process.execPath, [outfile], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const dur = Date.now() - ft0;
  const out = r.stdout || "";
  const err = r.stderr || "";
  if (out) process.stdout.write(out);
  if (err) process.stderr.write(err);
  const passed = (out.match(/^\s*✓ /gm) || []).length;
  const failedCases = ((out + err).match(/^\s*✗ /gm) || []).length;
  totalCases += passed;
  totalFailedCases += failedCases;
  if (r.status !== 0) failed++;
  fileMetrics.push({ file: f, passed, failed: failedCases, ok: r.status === 0, durationMs: dur });
}
const totalMs = Date.now() - t0;

if (isFullRun) {
  mkdirSync(join(outputRoot, "metrics"), { recursive: true });
  writeFileSync(
    join(outputRoot, "metrics", "unit.json"),
    JSON.stringify(
      {
        layer: "unit",
        testFiles: files.length,
        cases: totalCases,
        failedCases: totalFailedCases,
        failedFiles: failed,
        durationMs: totalMs,
        files: fileMetrics,
      },
      null,
      2
    )
  );
}

if (failed > 0) {
  console.error(`\n${failed} unit test file(s) FAILED (${totalFailedCases} case(s))`);
  process.exit(1);
}
console.log(
  `\nAll unit test files passed — ${totalCases} cases in ${files.length} files, ${(totalMs / 1000).toFixed(1)}s`
);
