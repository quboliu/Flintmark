// L4 chaos / fuzz (docs/05) — Neon/FoundationDB-style deterministic fuzzing.
//
// We feed RANDOM, ADVERSARIAL and MUTATED Markdown into the pure rendering
// pipeline and the string detectors, asserting STRUCTURAL INVARIANTS (never
// crash, never emit an out-of-bounds decoration, deterministic) rather than
// specific output. Markdown is user-/attacker-controlled text, and our real
// bugs (trailing-space tables, aliased callouts, weird nesting) were exactly
// this class.
//
// THE DISCIPLINE (learned the hard way — see git history): a fuzzer is only
// useful if every failure REPRODUCES. That requires the seed to be the SOLE
// source of nondeterminism — no wall clock, no scheduling, no ambient state.
//   1. One BASE seed -> a per-iteration independent sub-seed (seedFor) -> a
//      PRNG that fully determines the doc AND the cursor. Replay one failing
//      case with `FUZZ_SEED=<base> FUZZ_ITER=<i>` — no need to replay the
//      whole stream (FoundationDB/Neon: a failing seed reproduces 100%).
//   2. The parse tree is driven to COMPLETION, never left to a wall-clock
//      budget. CM6 fills syntaxTree(state) (=field.tree) with a ~20ms-budgeted
//      parse at transaction time; under CPU load that snapshot is partial and
//      varies run-to-run. mkState() materializes a complete tree deterministically
//      (see there), so real time never leaks into the result. This is our
//      analogue of Neon's virtual clock: the seed, not the machine, decides.
//   3. Because (1)+(2) make runs deterministic by construction, the determinism
//      CHECK is now a true bug detector: if two parses of one seed ever differ,
//      it's a genuine nondeterminism bug in OUR code, not machine load.
//   4. Every failing INPUT is dumped to out/chaos-crashes/ and can be promoted
//      to test/chaos/corpus/ (always replayed) so a bug, once found, is caught
//      forever — independent of later changes to the generator/token palette.
//
// Volume: FUZZ_RUNS (default 600; `npm run test:chaos` sets 20000). Replay a
// single case: FUZZ_SEED=<base> FUZZ_ITER=<i>. Runs in Node, no VS Code.
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { ofmMarkdown } from "../../src/webview/kernel/obsidianSyntax";
import {
  buildDecorations,
  isTableDelimiter,
  findTableBlocks,
  findComments,
  findFootnotes,
} from "../../src/webview/view/markdownDecorations";
import { parseHeadings } from "../../src/extension/outlineParser";
import {
  parseNote,
  extractWikiLinks,
  extractTags,
} from "../../src/extension/vault/linkParser";
import { shouldRevealConstruct } from "../../src/webview/kernel/reveal";

let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.error("  ✗ " + name + "\n      " + (e as Error).message);
  }
}

// --- config ------------------------------------------------------------------
const BASE_SEED = Number(process.env.FUZZ_SEED) || 0x1a2b3c4d;
const RUNS = Number(process.env.FUZZ_RUNS) || 600;
// Replay mode: run ONLY this iteration (both phases), for reproducing a failure.
const ONLY_ITER = process.env.FUZZ_ITER === undefined ? -1 : Number(process.env.FUZZ_ITER);
// Cap how far we drive the parse (keeps giant docs fast); mkState() drives the
// tree to completion up to this position so the result is load-independent.
const PARSE_UPTO = 300_000;
const PARSE_BUDGET_MS = 1e9; // per ensureSyntaxTree call: effectively unlimited time
const OUTPUT_ROOT = process.env.FLINTMARK_OUT_DIR || "out";
const CRASH_DIR = `${OUTPUT_ROOT}/chaos-crashes`;
const CORPUS_DIR = "test/chaos/corpus";
// Phase tags keep the soup and mutation sub-seed streams independent.
const PHASE_SOUP = 0x50facade;
const PHASE_MUT = 0x0badf00d;
const PHASE_FIXED = 0x0f17ed00;

// --- deterministic PRNG (mulberry32) + a seed mixer (splitmix32) -------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Decorrelate (base, phase, iter) into an independent 32-bit sub-seed. */
function seedFor(base: number, phase: number, iter: number): number {
  let x = (base ^ Math.imul(phase ^ (phase >>> 15), 0x2c1b3c6d)) >>> 0;
  x = (x ^ Math.imul(iter ^ (iter >>> 13), 0x297a2d39)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
}
interface Rng {
  float(): number;
  int(n: number): number;
  pick<T>(xs: readonly T[]): T;
}
function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    float: next,
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
  };
}

// --- token palette: good + adversarial Markdown atoms -----------------------
const TOKENS: readonly string[] = [
  "# ", "## ", "###### ", "####### too deep", "#nospace", "#",
  "**", "*", "***", "_", "__", "~~", "`", "``", "*a*b*c*d*", "**unclosed",
  "`code`", "**bold**", "_em_", "~~strike~~", "==hi==", "==unclosed",
  "```", "```js", "```rust", "~~~", "```\ncode\n```", "```unclosed\ncode",
  ">", "> ", ">>>>", "> [!note]", "> [!WARNING] x", "> [!important] k",
  "> [!unknowntype] z", "> [!]", "> [!note] title\n> body",
  "- ", "- [ ] ", "- [x] ", "* ", "+ ", "1. ", "1.", "   - nested", "- item",
  "| a | b |", "| --- | --- |", "|---|---| ", "| a |", "|", "| --- |",
  "| a | b |\n| --- | --- |\n| 1 | 2 |",
  "[[", "[[Note]]", "[[Note|alias]]", "![[img.png]]", "[text](url)",
  "[text](", "![alt](x.png)", "[[#heading]]", "[](", "![](",
  "$x$", "$$", "$$\nx=y\n$$", "$incomplete", "$$unclosed", "$e=mc^2$",
  "#tag", "#", "%%comment%%", "%%open", "[^1]", "[^1]: def", "[^", "[^x]",
  "---", "---\nk: v\n---",
  "\t", "  ", "café", "漢字", "😀", "​", " ", "﻿", "‮",
  "text", "word", "\r", "  \n",
  "x".repeat(300), "#".repeat(120), ">".repeat(80), "*".repeat(60),
];
const SEPS: readonly string[] = ["\n", "\n\n", " ", "\t", "", "\r\n", "\n  "];

function randomSoup(rng: Rng): string {
  const n = 1 + rng.int(40);
  let out = "";
  for (let i = 0; i < n; i++) out += rng.pick(TOKENS) + rng.pick(SEPS);
  return out;
}
function mutate(rng: Rng, base: string): string {
  const chars = [...base];
  const ops = 1 + rng.int(6);
  for (let i = 0; i < ops; i++) {
    if (chars.length === 0) break;
    const at = rng.int(chars.length);
    switch (rng.int(4)) {
      case 0: chars.splice(at, 1); break;
      case 1: chars.splice(at, 0, rng.pick(TOKENS)); break;
      case 2: chars.splice(at, 0, chars[at] ?? "x"); break;
      default: { const j = rng.int(chars.length); const t = chars[at]; chars[at] = chars[j]; chars[j] = t; }
    }
  }
  return chars.join("");
}

// --- fixed adversarial corpus (ALWAYS run) ----------------------------------
const FIXED: readonly string[] = [
  "", "\n", "\n\n\n\n", " ", "   ",
  "﻿# BOM heading",
  "#".repeat(1000),
  ">".repeat(1000) + " deeply nested quote",
  "```\n".repeat(500),
  "*".repeat(2000),
  "[[".repeat(1000),
  "$".repeat(1000),
  "| a | b |\n|---|---| \n| 1 | 2 |", // trailing-space delimiter (real bug)
  "> [!WARNING]\n> aliased upper-case type", // aliased callout (real bug)
  "- [ ] a\n  - [x] b\n    - [ ] c\n      - d",
  "| a | b | c |\n| - | - | - |\n" + "| x | y | z |\n".repeat(2000),
  "a".repeat(50000) + "\n",
  ("paragraph line number that repeats\n").repeat(15000),
  "x".repeat(2_100_000), // > LARGE_FILE_CHARS: must short-circuit to empty
  "text with\rlone CR\rand mixed\r\nendings\n",
  "%%\n".repeat(200),
  "[^1]\n".repeat(300),
  "$$\n".repeat(300),
  "---\n".repeat(100),
  "😀".repeat(5000),
  "‮".repeat(500) + "rtl override flood",
];

// --- invariants --------------------------------------------------------------
function mkState(doc: string, cursor: number): EditorState {
  // CM6 normalizes line endings (\r\n, lone \r -> \n), so its doc length can be
  // SHORTER than the raw JS string — clamp the cursor against state.doc.length.
  let state = EditorState.create({ doc, extensions: [ofmMarkdown()] });
  const anchor = Math.max(0, Math.min(cursor, state.doc.length));
  state = state.update({ selection: { anchor } }).state;
  // Drive the lazy language field to a COMPLETE tree. buildDecorations reads
  // syntaxTree(state) === field.tree, a SNAPSHOT that CM6 only fills via a
  // wall-clock-budgeted (~20ms) parse at transaction time. Under CPU load that
  // snapshot is PARTIAL and varies run-to-run — and ensureSyntaxTree alone
  // won't fix it: it advances field.context, not the field.tree snapshot. So we
  // advance the context with an unbounded budget, then materialize it into
  // field.tree with an empty transaction, looping until field.tree actually
  // covers the doc. Result: a tree that is deterministic regardless of machine
  // load — this is the root-cause fix for the "flake that won't reproduce".
  const want = Math.min(state.doc.length, PARSE_UPTO);
  for (let i = 0; i < 200 && syntaxTree(state).length < want; i++) {
    ensureSyntaxTree(state, want, PARSE_BUDGET_MS);
    state = state.update({}).state;
  }
  return state;
}

function serializeAndCheck(set: DecorationSet, len: number, doc: string): string {
  const parts: string[] = [];
  const it = set.iter();
  while (it.value) {
    const { from, to } = it;
    assert.ok(
      Number.isInteger(from) && Number.isInteger(to) && 0 <= from && from <= to && to <= len,
      `out-of-bounds decoration [${from},${to}] for doc len ${len}`
    );
    const spec = it.value.spec as { class?: string; widget?: { constructor: { name: string } } };
    parts.push(`${from},${to},${spec.class ?? ""},${spec.widget?.constructor?.name ?? ""}`);
    it.next();
  }
  return parts.join("|");
}

function checkBuildDecorations(doc: string, cursor: number): void {
  const s1 = mkState(doc, cursor);
  const len = s1.doc.length;
  const a = serializeAndCheck(buildDecorations(s1), len, doc);
  // (1) Same-state determinism — ALWAYS. Two builds over one fixed state must be
  //     byte-identical; a difference means hidden mutable state / unstable
  //     iteration order in OUR code. Zero dependence on parse timing.
  assert.equal(a, serializeAndCheck(buildDecorations(s1), len, doc),
    "buildDecorations non-deterministic for a fixed state (hidden mutable state / unstable order)");
  // (2) Independent-parse determinism — only when BOTH trees are COMPLETE. A
  //     complete Lezer parse is a pure function of the input, so two independent
  //     complete parses must yield identical decorations. We skip the compare on
  //     a partial tree, which is a CM6 lazy-parse budget artifact, not our bug.
  const want = Math.min(len, PARSE_UPTO);
  if (syntaxTree(s1).length >= want) {
    const s2 = mkState(doc, cursor);
    if (syntaxTree(s2).length >= want)
      assert.equal(a, serializeAndCheck(buildDecorations(s2), len, doc),
        "buildDecorations non-deterministic across independent complete parses");
  }
}

function checkRangeList(
  fn: (t: string) => { from: number; to: number }[],
  name: string,
  doc: string
): void {
  const out = fn(doc);
  assert.ok(Array.isArray(out), `${name} returned non-array`);
  for (const r of out)
    assert.ok(
      Number.isInteger(r.from) && Number.isInteger(r.to) && 0 <= r.from && r.from <= r.to && r.to <= doc.length,
      `${name} out-of-bounds [${r.from},${r.to}] len ${doc.length}`
    );
  assert.equal(JSON.stringify(out), JSON.stringify(fn(doc)), `${name} non-deterministic`);
}

function checkDetectors(doc: string): void {
  checkRangeList(findTableBlocks, "findTableBlocks", doc);
  checkRangeList(findComments, "findComments", doc);
  checkRangeList((t) => findFootnotes(t).map((f) => ({ from: f.from, to: f.to })), "findFootnotes", doc);
  for (const f of findFootnotes(doc))
    assert.ok(0 <= f.idFrom && f.idFrom <= f.idTo && f.idTo <= doc.length, `findFootnotes id out-of-bounds [${f.idFrom},${f.idTo}]`);
  for (const line of doc.split("\n"))
    assert.equal(typeof isTableDelimiter(line), "boolean", "isTableDelimiter must return boolean");
  const heads = parseHeadings(doc);
  for (const h of heads) {
    assert.ok(h.level >= 1 && h.level <= 6, `heading level out of range: ${h.level}`);
    assert.ok(h.line >= 0, `heading line negative: ${h.line}`);
  }
  assert.equal(JSON.stringify(parseHeadings(doc)), JSON.stringify(heads), "parseHeadings non-deterministic");
  assert.equal(JSON.stringify(parseNote(doc)), JSON.stringify(parseNote(doc)), "parseNote non-deterministic");
  assert.equal(JSON.stringify(extractWikiLinks(doc)), JSON.stringify(extractWikiLinks(doc)), "extractWikiLinks non-deterministic");
  assert.equal(JSON.stringify(extractTags(doc)), JSON.stringify(extractTags(doc)), "extractTags non-deterministic");
}

/** Run every invariant on one input; on failure, persist the input + a precise
 *  replay command (this is the "capture every error" guarantee). */
function runCase(doc: string, cursor: number, replay: string): void {
  try {
    checkBuildDecorations(doc, cursor);
    checkDetectors(doc);
  } catch (e) {
    dumpCrash(doc, cursor, replay, e as Error);
    throw new Error(`${(e as Error).message}\n      REPLAY: ${replay}`);
  }
}

function dumpCrash(doc: string, cursor: number, replay: string, err: Error): void {
  try {
    fs.mkdirSync(CRASH_DIR, { recursive: true });
    const tag = replay.replace(/[^A-Za-z0-9=_-]/g, "_");
    const file = path.join(CRASH_DIR, `${tag}.md`);
    fs.writeFileSync(
      file,
      `<!-- chaos crash\n${replay}\ncursor=${cursor}\nerror: ${err.message}\n` +
        `to make this a permanent regression: move this file into ${CORPUS_DIR}/ -->\n${doc}`
    );
    console.error(`      crash input saved -> ${file}`);
  } catch {
    /* best-effort */
  }
}

/** Durable regression corpus: every .md under test/chaos/corpus is replayed. */
function loadCorpus(): { name: string; doc: string }[] {
  try {
    if (!fs.existsSync(CORPUS_DIR)) return [];
    return fs
      .readdirSync(CORPUS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ name: f, doc: fs.readFileSync(path.join(CORPUS_DIR, f), "utf8") }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const startedAt = Date.now();
console.log(
  `  (chaos base seed=${BASE_SEED}, runs=${RUNS}` +
    (ONLY_ITER >= 0 ? `, REPLAY iter=${ONLY_ITER}` : "") +
    `)  — replay a failure with FUZZ_SEED=<base> FUZZ_ITER=<i>`
);

test("shouldRevealConstruct never throws on adversarial ranges", () => {
  const vals = [-5, 0, 1, 10, 1e9, NaN, Infinity];
  for (const cf of vals) for (const ct of vals) for (const sf of vals) for (const st of vals)
    assert.equal(typeof shouldRevealConstruct(cf, ct, [{ from: sf, to: st }]), "boolean");
});

test("fixed adversarial corpus: pipeline + detectors hold all invariants", () => {
  if (ONLY_ITER >= 0) return; // replay mode targets a sweep iter, skip the broad corpus
  FIXED.forEach((doc, i) => runCase(doc, makeRng(seedFor(BASE_SEED, PHASE_FIXED, i)).int(doc.length + 1), `FIXED[${i}]`));
});

test("durable regression corpus (test/chaos/corpus/*.md): invariants hold", () => {
  if (ONLY_ITER >= 0) return;
  const corpus = loadCorpus();
  if (corpus.length === 0) { console.log("    (no saved corpus files yet)"); return; }
  for (const { name, doc } of corpus) runCase(doc, 0, `corpus:${name}`);
});

test(`random soup sweep (${RUNS} seeds): no crash, in-bounds, deterministic`, () => {
  const range = ONLY_ITER >= 0 ? [ONLY_ITER] : [...Array(RUNS).keys()];
  for (const i of range) {
    const rng = makeRng(seedFor(BASE_SEED, PHASE_SOUP, i));
    const doc = randomSoup(rng);
    runCase(doc, rng.int(doc.length + 1), `FUZZ_SEED=${BASE_SEED} FUZZ_ITER=${i} (soup)`);
  }
});

test(`mutation fuzz sweep (${RUNS} seeds): mutate the fixed corpus, invariants hold`, () => {
  const range = ONLY_ITER >= 0 ? [ONLY_ITER] : [...Array(RUNS).keys()];
  const small = FIXED.filter((d) => d.length < 5000);
  for (const i of range) {
    const rng = makeRng(seedFor(BASE_SEED, PHASE_MUT, i));
    const doc = mutate(rng, rng.pick(small) || "x");
    runCase(doc, rng.int(doc.length + 1), `FUZZ_SEED=${BASE_SEED} FUZZ_ITER=${i} (mutation)`);
  }
});

// Quantified metrics for the consolidated report (skip in single-iter replay).
if (ONLY_ITER < 0) {
  const corpusCount = loadCorpus().length;
  const docsFuzzed = RUNS * 2 + FIXED.length + corpusCount; // soup + mutation phases
  try {
    fs.mkdirSync(`${OUTPUT_ROOT}/metrics`, { recursive: true });
    fs.writeFileSync(
      `${OUTPUT_ROOT}/metrics/chaos.json`,
      JSON.stringify(
        {
          layer: "chaos",
          baseSeed: BASE_SEED,
          runsPerPhase: RUNS,
          phases: 2,
          docsFuzzed,
          fixedCorpus: FIXED.length,
          savedCorpus: corpusCount,
          failures: failed,
          durationMs: Date.now() - startedAt,
        },
        null,
        2
      )
    );
  } catch {
    /* best-effort */
  }
}

if (failed > 0) {
  console.error(`\n${failed} chaos test(s) FAILED — each failure above prints a REPLAY command`);
  process.exit(1);
}
console.log("\nAll chaos tests passed");
