# Changelog

All notable changes to Flintmark are documented here. Versions are pre-1.0 while
the editor stabilizes for the Marketplace.

## Unreleased

- **Zed developer preview.** A native Zed extension adapter now exposes
  Flintmark's vault intelligence through LSP: wikilink/tag/heading/block
  completion, definition and reference navigation, backlinks, hover/document
  links, heading/task Outline symbols, workspace symbols, and Obsidian-oriented
  snippets. It uses Zed's built-in Markdown preview because Zed does not yet
  expose a custom-editor or webview API.
- **Coordinated multi-editor releases.** One version tag now validates both
  manifests and produces the VSIX, a downloadable Zed language-server bundle,
  a Zed dev-extension archive, and checksums on the same GitHub Release. CI
  checks the Zed Rust/WASM adapter and runs an end-to-end LSP protocol smoke
  test alongside the shared parser tests.

## 0.32.13

- **Keystrokes no longer rescan the whole document.** Table and inline-SVG
  resource scans now run once per change inside a shared, cached measurement
  field: a plain-text keypress in a resource-free document performs no table
  or media scan at all, and documents beyond the Live Preview cutoff skip
  full-text scans entirely instead of running three per edit.
- **Documents with more than 2,048 unique tables no longer live-lock.** Table
  measurement is budgeted to the first 2,048 unique sources, so the pending
  count actually reaches zero and the per-frame measurement loop stops;
  overflow tables stay as Markdown source instead of blocking publication
  forever.
- **Images with query strings keep their own sizes.** Media identity now
  strips only Flintmark's own cache-buster (`ofmIndex`), so same-path URLs
  with different query parameters — and SVG `#fragment` views — no longer
  share aspect ratios or oscillate between load and redecorate cycles.
- **Media measurement scales linearly.** The 512-entry probe/cache cap is
  gone: probes are reconciled exactly against the document's current media
  sources (departed sources are cancelled, in-flight loads are aborted when
  the editor closes), and image/SVG widgets no longer rebuild on every
  unrelated measurement — 100 delayed image loads now cause near-100 widget
  rebuilds instead of ~5,000.
- **Font and theme changes fully recalibrate offscreen heights.** Live
  settings/theme changes briefly mount the whole document (within the Live
  Preview size limit) so CodeMirror's height map is rebuilt from real DOM
  measurements — jumping to the far end of a long note right after a font
  change no longer "repairs" the scroll height, while ordinary metric
  sampling stays guarded against destructive full-map rebuilds.
- **Vault index robustness.** Removing and re-adding the same workspace
  folder can no longer let a stale background build overwrite the fresh
  snapshot (generations are monotonic for the driver's lifetime), and vault
  autocomplete data is handed out as copies so callers cannot mutate the
  published cache.
- **Stronger release gates.** The vault-ready E2E now proves "paint first,
  autocomplete later" deterministically with a build gate instead of racing a
  10k-file scan, and a retried E2E pass is visibly reported as a flaky-pass
  in CI instead of silently counting as clean.

## 0.32.12

- **Large workspaces no longer stall note opens.** The vault index (wikilinks,
  backlinks, tags) now builds cooperatively — time-sliced chunks, cancellation,
  and atomic publication — so opening a note stays responsive even while a
  40k-file workspace scan is in flight. The editor never waits for the index;
  autocomplete data arrives via the existing follow-up push without rebuilding
  the editor. In the real 42k-file vault, opening a note during the initial
  scan dropped from ~3.6s to ~0.4s.
- **Saving a note no longer re-scans the workspace.** Content-only saves patch
  a single file (one read, no full `findFiles`, no full re-index); only
  structural events (create/delete/rename/directory operations) fall back to a
  full — still cooperative — rebuild. Watcher events route to the correct
  index by leaf type, and per-open image-index refreshes are throttled by a
  state-aware freshness gate that still forces on attachment saves.
- **Stable scrolling in long, table- and image-heavy notes.** Tables, images,
  and inline SVGs now carry precisely measured heights (an offscreen layout
  pass under the real content box, fonts, and theme), so CodeMirror's height
  map no longer collapses mid-scroll — fixing the mid-document "scroll spins
  in place / jumps back up" behavior. Tables without a reliable measurement
  briefly stay as Markdown source instead of mounting with an unknown height,
  measurements swap atomically on width/font/theme changes, and the editor
  suppresses CodeMirror's destructive full height-map rebuild unless the
  wrapping mode actually changes.
- **Reliability gates.** New unit/property coverage for cooperative and
  incremental indexing, media/table height prediction, and a rewritten
  long-scroll E2E with per-wheel scroll monotonicity, a ≤2px
  prediction-vs-real contract, and a layout-invalidation anchor check driven
  through the real settings channel.

## 0.32.11

- **Todo panel for the active document.** The Flintmark sidebar now aggregates
  standard and extended Markdown task states between Outline and Backlinks,
  preserves document order, and navigates directly to the selected task in
  Live Preview.
- **Reliable, low-overhead Todo synchronization.** Outline and Todo share one
  version-keyed Markdown structure scan; burst edits are coalesced without
  starving updates, while source edits, Live Preview edits, undo/redo, external
  file changes, document switches, and cold-open navigation stay synchronized.
- **Todo reliability gates.** Parser, cache, refresh, stale-target, integration,
  performance, and real-editor E2E coverage now guard the feature on every
  change and before release.
- **Install directly from the VS Code Marketplace.** The English and Chinese
  READMEs now link to `quboliu.flintmark` and document Marketplace search and
  command-line installation, while retaining VSIX installation as a fallback.
- **Automated Marketplace releases.** Tagged builds validate the release,
  create the GitHub Release, and publish the same VSIX to the VS Code
  Marketplace when an environment-scoped publishing token is available.
  GitHub releases remain available for manual Marketplace upload when
  credentials or the Marketplace service are unavailable.

## 0.32.10

- **Line-delimited display math renders in Live Preview.** TeX enclosed by
  delimiter-only `$$` lines now renders as a measured KaTeX block, including
  multi-line formulas such as chained Attention transformations. Moving the
  caret into the block still reveals the editable Markdown source.
- **Strict math regressions.** Unit coverage pins the requested Attention
  formula, fenced-code isolation, and safe handling of unclosed delimiters; the
  real-editor E2E suite verifies error-free KaTeX output and guards click-to-caret
  alignment below multiple display blocks by checking the exact persisted line.

## 0.32.9

- **Larger in-file search panel.** The Live Preview find/replace panel is roomier,
  with wider inputs, larger controls, and wrapping layout for narrow panes.
- **Regression coverage: Enter advances Live Preview search.** The E2E suite now
  verifies the CodeMirror search panel keeps Enter/Shift+Enter navigation active
  after the panel styling changes.

## 0.32.8

- **Fix: light mode uses a pure white editor background.** The light surface now
  resolves to the theme's white base instead of a slightly grey derived fallback.
- **Regression coverage: code tokens must receive theme colors.** The Live
  Preview e2e suite now fails if fenced-code tokens exist but are visually
  uncolored, protecting the bundled theme CSS path used by syntax highlighting.

## 0.32.7

- **Inline SVG blocks render in Live Preview.** Flintmark now renders raw
  `<svg>...</svg>` HTML blocks, including the common plain `<div>` wrapper used
  by Obsidian notes, as preview images instead of showing the source. The renderer
  is intentionally narrow: only a single SVG block is accepted, the caret reveals
  editable source, and unsafe SVG markup is stripped before the image is loaded.

## 0.32.6

- **Fix: local images survive parent-folder renames and bulk attachment changes.**
  Flintmark now treats VS Code file watcher events as invalidation hints and
  rebuilds image/note indexes from a reconciled workspace snapshot. This fixes
  broken images after renaming a folder that contains a note and its `assets/`
  directory, and covers nested attachment trees created outside VS Code.

## 0.32.5

- **Fix: Live Preview now tracks VS Code theme changes.** The editor projects
  VS Code's dark/light/high-contrast mode onto the Flintmark root instead of
  mutating the webview body, and updates CodeMirror's theme polarity in place.
  This fixes the dark-theme caret, removes the light gutter strip, and keeps
  scroll position/selection intact when switching themes.

## 0.32.4

- **Fresh-open YAML defaults to Properties preview.** Notes that start with
  YAML frontmatter now initialize the caret just after the frontmatter block, so
  the Properties panel appears immediately on open while still revealing editable
  YAML when the panel itself is clicked.
- **Fix: long documents keep preview stable while fast-scrolling.** Live Preview
  decorations no longer rebuild from viewport-only ranges on every scroll; this
  keeps CodeMirror's height map stable for code-heavy notes and prevents the
  temporary source/blank rendering seen when scrolling quickly through long
  documents. Very large files above the full-preview cutoff now keep a stable
  source view instead of attempting partial layout-affecting preview.

## 0.32.3

- **Fix: YAML Properties no longer breaks click targeting.** The Properties
  panel now follows CodeMirror's block-widget measurement rules, so clicking
  lines below frontmatter lands the caret on the clicked line instead of the next
  line or a blank line.
- **Editable Properties panel.** Clicking the Properties panel now reveals the
  raw YAML frontmatter in place; move the cursor back into the note body and the
  panel returns.

## 0.32.2

- **Properties panel, closer to Obsidian.** The panel now has a **"Properties"
  header** and a **per-property type icon** in the leading column — a calendar for
  ISO dates, a list glyph for sequences, a tag glyph for `tags`, and text lines for
  plain scalars. Icons are inferred from each value and drawn inline (Lucide-style),
  with **no icon-font dependency**, so there's no measurable rendering cost. The
  panel stays read-only; edit the raw YAML in the Code view (`</>`).

## 0.32.1

- **Fix: the Properties panel now appears on open.** In 0.32.0 it was reveal-gated,
  so a note that opened with the cursor at the top (inside the frontmatter) showed
  raw YAML instead of the panel — it looked like nothing happened. The panel is now
  **always shown** (matching Obsidian's Live Preview); edit the raw YAML via the
  Code view (`</>`), mirroring Obsidian's Source mode.

## 0.32.0

- **Properties panel for frontmatter.** YAML frontmatter renders as an
  Obsidian-style Properties panel (each key with its value, list/tag values as
  chips) instead of dimmed raw `---` text. Put the cursor in it to edit the raw
  YAML; move away and the panel returns. Backed by a minimal, dependency-free YAML
  parser (scalars, block lists, inline arrays, quoted values, blank-line-tolerant)
  that falls back to the raw block on anything more complex. The frontmatter region
  is now excluded from the Markdown passes, so YAML is no longer half-rendered
  (list items as bullets, numbers colored).

## 0.31.1

- **Fix: the page margin from 0.31.0 wasn't actually applied** — the preview still
  read edge-to-edge. Root cause: `.cm-content` padding/layout was set in the host
  stylesheet, where CodeMirror's own base theme (injected later at equal CSS
  specificity) silently overrode it. All `.cm-*` editor styling now lives in the
  CM6 theme layer (`EditorView.theme`, the standard place), which outranks the base
  theme. An e2e test now asserts the computed side margin so it can't regress.

## 0.31.0

- **Comfortable, stable page margins.** The Live Preview now fills the editor
  width with a fixed side margin by default, instead of sitting nearly edge-to-edge
  in a narrow pane — and without the big side gutters that used to appear when the
  pane was very wide. `ofm.lineWidth` is now: `0` (default) = fill with a fixed
  margin; `20`–`240` = a centered readable column of that many `rem`.
- **Branding.** The Settings section and the custom editor now read **Flintmark**
  (previously "Markdown Live Preview").

## 0.30.2

- Pasting/dropping an image over the 24 MB cap now shows a visible warning
  instead of failing silently (follow-up to the 0.30.1 oversize guard, which had
  traded the freeze for a silent drop).

## 0.30.1

- Fixes from an adversarial (Codex) review of 0.30.0:
  - `[[#` now switches from note to heading completion (it previously reused the
    note list); heading completion **excludes YAML frontmatter** and **includes
    Setext headings**.
  - Wikilinks with `#`/`^` anchors and existing `.markdown` notes resolve before
    the unresolved-link flow offers to create a duplicate.
  - Image paste **replaces the selection**; an oversize image is rejected **before**
    it's read (no webview freeze); attachment names strip wikilink-breaking
    characters (`#` `[` `]` `^`); the de-dup loop never overwrites an existing file.
- Test integrity: the new pure modules (`settings`, `newNote`) joined the
  mutation-testing gate (90%+ test strength); a dead defensive branch was removed.

## 0.30.0

- **Autocomplete.** Type `[[` to complete vault notes, `#` to complete tags, and
  `[[#` to complete the current note's headings (ATX + Setext) — backed by the
  vault index, pushed to the editor and refreshed as the vault changes.
- **Heading folding.** Collapse/expand a heading's section from the gutter arrow
  or with `Ctrl/⌘-Shift-[` / `]` (a `#` inside fenced code never counts as a
  heading).
- **Image paste & drop.** Paste or drag an image into a note to save it next to
  the file and insert the `![[name]]` embed. Image types only, with a size cap;
  the embed name is sanitized so it always resolves.
- CI gate: theme-CSS changes (`media/themes/**`) no longer skip CI (only
  `media/shots/**` is ignored).
- New logic is unit-tested (autocomplete/folding/attachment helpers at 100%
  coverage) with webview e2e for the popup, fold keymap, and paste round-trip.

## 0.29.0

- **Editing shortcuts.** Toggle inline markup around the selection — bold
  (`Ctrl/⌘-B`), italic (`Ctrl/⌘-I`), inline code (`Ctrl/⌘-E`), strikethrough
  (`Ctrl/⌘-Shift-X`), and link (`Ctrl/⌘-K`). Paste a URL over selected text to
  turn it into `[selection](url)`.
- **Code-block Copy button** on every rendered fenced block.
- **Extended task states.** Beyond GFM `[ ]`/`[x]`: `[/]` in progress, `[-]`
  cancelled (struck through), `[>]` forwarded, `[?]` question render as styled
  checkboxes.
- **Create note on click.** Clicking an unresolved `[[wikilink]]` offers to create
  that note next to the current one; heading/block anchors and aliases are now
  stripped before resolving so existing anchored links aren't treated as missing.
- All new logic is unit-tested (pure helpers at 100% coverage) with webview e2e
  for the interactive paths.

## 0.28.1

- **Custom fonts for rendered Markdown.** Three new settings let the Live Preview
  use its own fonts, independent of the VS Code / Cursor editor font: `ofm.fontFamily`
  (prose — body text and headings), `ofm.fontSize` (prose size in px), and
  `ofm.monospaceFontFamily` (code blocks, inline code, frontmatter). Empty = follow
  the active theme / editor font, as before. Changes apply live (no reopen). The
  values feed dedicated `--ofm-*` override variables that sit at the front of the
  font cascade, so a chosen font wins over both the theme and the editor font.
  Backed by pure, unit-tested normalization (clamping + family sanitization) plus
  a webview e2e assertion.

## 0.28.0

- **Vault-wide image resolution.** Obsidian image embeds (`![[image.png]]`) and
  bare relative images now resolve across the whole vault: attachments kept in any
  folder and referenced by a bare name render correctly when an Obsidian vault is
  opened in VS Code (previously only same-folder images resolved). Adds `|W` /
  `|WxH` sizing. Backed by a per-workspace-root, path-only attachment index with
  synchronous resolution on the editor hot path; design reviewed adversarially.
- **Quality system.** Seed-reproducible chaos/fuzz tests, mutation testing
  (Stryker), coverage (c8), a consolidated metrics report, and a CI gate
  (lint + types + unit + chaos → webview e2e) plus a weekly deep run.

## 0.25.0

- **Rebrand to Flintmark** and Marketplace publish prep: extension icon,
  bilingual (English + 中文) README, this changelog, corrected third-party
  notices, and a leaner package (probe artifacts and dev files excluded).
- Prominent credit for the bundled **Things** theme (© Stephan Ango / maintained
  by Colin Eckert, MIT) in the README and `THIRD-PARTY-NOTICES.md`.

## 0.24.0

- AI Selection Bridge trace is mirrored to `/tmp/flintmark-ai.log` so it can be
  inspected outside the editor.

## 0.23.0

- Instrumented the AI Selection Bridge end-to-end (a "Flintmark AI" output
  channel tracing every hop) + the **Flintmark: Show AI Log** command and a
  manual test checklist. The Add-to-Chat / Edit round-trip was verified working
  in a logged-in Cursor.

## 0.22.0

- Footnotes: `[^1]` references and `[^1]:` definitions render as superscript
  labels with the bracket syntax hidden (reveal-gated).

## 0.21.0

- Callouts with no custom title now show the capitalized type name (e.g.
  "Note"), matching Obsidian.
- Obsidian `%% comments %%` are hidden in preview (revealed while editing);
  fenced-code `%%` (e.g. Mermaid) is left untouched.

## 0.20.0

- Full Obsidian callout type + alias color set (`[!important]`, `[!abstract]`,
  `[!todo]`, `[!failure]`, …) — previously these fell back to a gray box.

## 0.19.0

- Theme alignment with Things: body text font, heading sizes/weights from theme
  variables, dimmed formatting markers (`cm-formatting-*`), and Obsidian-style
  task checkboxes.

## 0.18.0

- Table cells pick up the active theme's inline colors (bold/italic/highlight/
  code), matching body text.

## 0.17.0

- Tolerant GFM table detection — tables whose delimiter row has trailing
  whitespace now render (previously dropped by the strict parser).

## 0.16.0 and earlier

- Live Preview foundation: in-place rendering for headings, bold/italic,
  inline/fenced code with syntax highlighting, quotes, callouts, lists, task
  checkboxes, tables, images, `![[embeds]]`, `[[wikilinks]]`, `#tags`,
  `==highlights==`, frontmatter, horizontal rules, KaTeX math, and Mermaid.
- Cursor-driven Reveal (raw syntax on the active line/block).
- Pluggable theme system with the **Things** theme bundled as default; variable-
  level Obsidian theme compatibility; configurable content width.
- AI Selection Bridge (reuse the host's native Copilot/Cursor AI), Outline and
  Backlinks panels, in-editor find/replace, and Live ↔ Code toggle.
- Markdown text stays the single source of truth on disk.
