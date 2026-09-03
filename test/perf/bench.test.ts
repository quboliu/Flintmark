// Performance benchmark (NOT a per-push gate). Measures buildDecorations the way
// the app uses it — decorating the whole document below the Live Preview cutoff
// so CM6's height map remains stable during fast scrolling, and taking the
// stable source fallback above that cutoff. Deliberately NOT a hard wall-clock
// budget: those flake on a busy machine (a lesson this codebase learned via the
// chaos suite). The only assertion is a GENEROUS catastrophic regression guard
// (catches accidental O(n^2)/blowups, not normal drift). Track the printed
// numbers over time; run on a quiet machine for trustworthy figures. Run:
// npm run test:perf
import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { VisibleRange } from "../../src/webview/view/markdownDecorations";
import { ofmMarkdown } from "../../src/webview/kernel/obsidianSyntax";
import {
  buildDecorations,
  LIVE_PREVIEW_DECORATION_CHAR_LIMIT,
} from "../../src/webview/view/markdownDecorations";

const OUTPUT_ROOT = process.env.FLINTMARK_OUT_DIR || "out";
let failed = 0;
// Generous: ~50x typical; only catches catastrophic regressions, never drift.
const CATASTROPHIC_MS = 1500;
const startedAt = Date.now();
const results: { label: string; docChars: number; previewActive: boolean; medianMs: number }[] = [];

// A representative ~16-char-per-line mix of constructs.
function makeDoc(lines: number): string {
  const palette = [
    "# Heading here",
    "Body **bold** `code` text",
    "> [!note] callout",
    "- [ ] a task item",
    "| a | b |\n| --- | --- |\n| 1 | 2 |",
    "[[Wiki Link]] and #tag",
    "plain paragraph line",
  ];
  const out: string[] = [];
  for (let i = 0; i < lines; i++) out.push(palette[i % palette.length]);
  return out.join("\n");
}

function bench(label: string, lines: number): void {
  const doc = makeDoc(lines);
  const state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [ofmMarkdown()],
  });
  const previewActive = state.doc.length <= LIVE_PREVIEW_DECORATION_CHAR_LIMIT;
  if (previewActive) {
    // Parse the document to completion (deterministic; mirrors a settled view).
    for (let i = 0; i < 50 && syntaxTree(state).length < state.doc.length; i++) {
      ensureSyntaxTree(state, state.doc.length, 1e9);
    }
  }
  const ranges: VisibleRange[] = [{ from: 0, to: state.doc.length }];

  // Warm up, then time the median of several runs.
  for (let i = 0; i < 3; i++) buildDecorations(state, ranges);
  const samples: number[] = [];
  for (let i = 0; i < 21; i++) {
    const t0 = process.hrtime.bigint();
    buildDecorations(state, ranges);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  results.push({
    label,
    docChars: doc.length,
    previewActive,
    medianMs: Number(median.toFixed(3)),
  });
  console.log(
    `  ${label.padEnd(22)} doc=${String(doc.length).padStart(8)} chars  mode=${previewActive ? "preview" : "source fallback"}  median=${median.toFixed(2)} ms`
  );
  assert.ok(
    median < CATASTROPHIC_MS,
    `${label}: buildDecorations median ${median.toFixed(0)}ms exceeds catastrophic guard ${CATASTROPHIC_MS}ms`
  );
}

console.log("buildDecorations whole-document/fallback benchmark (median of 21):");
try {
  bench("small (100 lines)", 100);
  bench("medium (1k lines)", 1000);
  bench("large (10k lines)", 10000);
  bench("huge (50k lines)", 50000);
} catch (e) {
  failed++;
  console.error("  ✗ " + (e as Error).message);
}

try {
  mkdirSync(`${OUTPUT_ROOT}/metrics`, { recursive: true });
  writeFileSync(
    `${OUTPUT_ROOT}/metrics/perf.json`,
    JSON.stringify(
      { layer: "perf", sizes: results, durationMs: Date.now() - startedAt },
      null,
      2
    )
  );
} catch {
  /* best-effort */
}

if (failed > 0) {
  console.error(`\n${failed} perf check(s) FAILED`);
  process.exit(1);
}
console.log("\nperf benchmark complete");
