# Flintmark for Zed

This directory contains Flintmark's Zed extension adapter. It attaches the
Flintmark language server to Zed's built-in `Markdown` and `Markdown-Inline`
languages and adds Obsidian-oriented snippets.

## What works

- `[[note]]`, `[[note#heading]]`, `[[note#^block]]`, and `#tag` completion.
- Go to definition for wikilinks and their heading/block targets.
- Find all references for notes, headings, and tags (the references for a note
  are its backlinks).
- Hover details and clickable resolved wikilinks.
- Zed Outline symbols for headings and standard/extended task states.
- Workspace symbols for notes and headings.
- Callout, task, wikilink, frontmatter, and display-math snippets.
- Zed's native Markdown preview, opened with `markdown: open preview` or
  `markdown: open preview to the side`.

## Host limitation

Zed's [documented extension surface](https://zed.dev/docs/extensions/developing-extensions)
does not currently expose custom editors, webviews, editor decorations/widgets,
or extension-owned sidebars. The VS Code edition's caret-aware inline Live
Preview, clickable checkboxes, rendered Properties, KaTeX/Mermaid widgets, and
dedicated Todo/Backlinks panels therefore cannot be ported faithfully today.
This extension exposes the useful headless parts via LSP and leaves rendering
to Zed's native Markdown preview.

## Development install

From the repository root, build and smoke-test the language server:

```sh
npm ci
npm run test:zed
```

In Zed, run `zed: install dev extension` and select `editors/zed`.

Released builds download the matching language-server archive from the same
GitHub release tag. Before the first coordinated release, or while changing
the server locally, point the adapter at the local bundle in Zed settings:

```json
{
  "lsp": {
    "flintmark": {
      "binary": {
        "path": "/absolute/path/to/node",
        "arguments": ["/absolute/path/to/flintmark/out/zed/flintmark-lsp.cjs", "--stdio"]
      }
    }
  }
}
```

Build the adapter as the same WebAssembly target Zed uses with:

```sh
rustup target add wasm32-wasip2
cargo build --locked --release --manifest-path editors/zed/Cargo.toml --target wasm32-wasip2
```

See [the repository release guide](../../.github/RELEASING.md) for the shared
VS Code/Zed release sequence.
