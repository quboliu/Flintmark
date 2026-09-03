<p align="center">
  <img src="media/icon.png" width="96" alt="Flintmark icon">
</p>

<h1 align="center">Flintmark</h1>

<p align="center">
  <strong>Obsidian-style Markdown Live Preview for VS Code.</strong>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#screenshots">Screenshots</a> ·
  <a href="#supported-markdown">Supported Markdown</a> ·
  <a href="#install">Install</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#building-from-source">Build</a>
</p>

<p align="center">
  <a href="https://github.com/quboliu/flintmark/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/quboliu/flintmark/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/quboliu/flintmark/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/quboliu/flintmark?label=release"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=quboliu.flintmark"><img alt="VS Code Marketplace" src="https://img.shields.io/visual-studio-marketplace/v/quboliu.flintmark?label=VS%20Code%20Marketplace"></a>
  <img alt="VS Code 1.89+" src="https://img.shields.io/badge/VS_Code-1.89%2B-007ACC?logo=visualstudiocode&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

Flintmark is a custom Markdown editor for VS Code. It renders formatting in the
document and reveals the source around the caret, so editing and previewing
happen in the same tab. The file on disk is still an ordinary `.md` file.

It also adds the pieces that are usually missing when an Obsidian vault is
opened in VS Code: wikilink and tag completion, Properties, image embeds,
Outline, Todo, and Backlinks.

![A technical note open in Flintmark, with Properties, a callout, a table, and Go code](media/shots/go-pipelines-dark.png)

## Screenshots

These screenshots were taken with the extension itself, loaded from this
repository in a VSCodium development host.

### Dark and light themes

Flintmark follows the current VS Code color mode. Changing themes updates the
open editor in place, without moving the caret or resetting the scroll position.

<table>
  <tr>
    <td width="50%"><img src="media/shots/go-pipelines-dark.png" alt="Flintmark using a dark VS Code theme"></td>
    <td width="50%"><img src="media/shots/go-pipelines-light.png" alt="Flintmark using a light VS Code theme"></td>
  </tr>
  <tr>
    <td align="center"><strong>Dark</strong></td>
    <td align="center"><strong>Light</strong></td>
  </tr>
</table>

### Editing in place

Click a rendered line to edit its Markdown. Move the caret elsewhere and the
line renders again. Task checkboxes can be toggled directly, and fenced code
blocks keep their highlighting and Copy button while they are not being edited.

Flintmark also provides shortcuts for bold, italic, inline code, strikethrough,
and links. If text is selected, pasting a URL turns the selection into a
Markdown link.

![Editing tasks and a fenced JavaScript block in Flintmark](media/shots/editing.png)

Type `[[` to complete a note name, `#` to complete a tag, or `[[#` to complete
a heading in the current note. The lists are refreshed when files in the
workspace change.

![Wikilink completion in Flintmark](media/shots/autocomplete.png)

### Properties

Flintmark displays simple YAML frontmatter as a Properties panel. Dates, lists,
and tags get their own icons, and list values are shown as chips. Click the panel
to edit the YAML. Frontmatter that Flintmark cannot parse is left as source.

![Frontmatter displayed as a Properties panel](media/shots/properties.png)

### Outline, Todo, and Backlinks

VS Code's built-in Markdown Outline cannot read a custom webview editor, so
Flintmark includes its own sidebar views:

- **Outline** shows the headings in the active note.
- **Todo** lists every standard and extended task in source order.
- **Backlinks** lists notes that link to the active note.

Clicking an Outline or Todo row moves the caret to that line in Live Preview.

![Outline, Todo, and Backlinks open beside a note](media/shots/navigation.png)

### Rendered Markdown

<table>
  <tr>
    <td width="50%">
      <strong>Callouts</strong><br>
      Common Obsidian callout types and aliases have their own colors.<br><br>
      <img src="media/shots/callouts.png" alt="Note, tip, warning, and important callouts">
    </td>
    <td width="50%">
      <strong>Task states</strong><br>
      In-progress, cancelled, forwarded, and question states are included.<br><br>
      <img src="media/shots/tasks.png" alt="Standard and extended Markdown task states">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Code blocks</strong><br>
      More than 30 languages are highlighted; each block has a Copy button.<br><br>
      <img src="media/shots/code.png" alt="Highlighted SQL and Python code blocks">
    </td>
    <td width="50%">
      <strong>GFM tables</strong><br>
      Bold, italic, code, links, and highlights also work inside cells.<br><br>
      <img src="media/shots/table.png" alt="A rendered GFM table">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Math</strong><br>
      KaTeX is used for inline math and display blocks.<br><br>
      <img src="media/shots/math.png" alt="Inline and display math rendered with KaTeX">
    </td>
    <td width="50%">
      <strong>Mermaid</strong><br>
      Mermaid blocks render as diagrams and return to source for editing.<br><br>
      <img src="media/shots/mermaid.png" alt="A Mermaid flowchart">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Inline syntax</strong><br>
      Wikilinks, tags, highlights, footnotes, comments, and inline code.<br><br>
      <img src="media/shots/inline.png" alt="Wikilinks, tags, highlights, footnotes, and inline code">
    </td>
    <td width="50%">
      <strong>Images</strong><br>
      Standard Markdown images and vault-wide <code>![[embeds]]</code>.<br><br>
      <img src="media/shots/images.png" alt="An image embed resolved from an attachments folder">
    </td>
  </tr>
</table>

Blockquotes, ordered and unordered lists, horizontal rules, Setext headings,
footnote definitions, and sanitized inline SVG blocks are supported too.
`%% comments %%` are hidden until the caret enters them.

### Images and attachments

Pasting or dropping an image saves it next to the note and inserts an
`![[image-name.ext]]` embed. Flintmark cleans up characters that would break a
wikilink, picks a new name rather than overwriting an existing file, and shows a
warning for unsupported or oversized images.

Image embeds can be found by bare name anywhere in the vault. Width and height
can be set with `![[image.png|200]]` or `![[image.png|200x120]]`.

### Copilot and Cursor

Copilot and Cursor normally cannot see a selection inside a webview. When text
is selected in Flintmark, a small toolbar offers two ways around that:

- **Edit** opens the same range in the source editor and, by default, starts the
  host's inline AI command.
- **Add to Chat** attaches the range to the host's chat or composer.

![Edit and Add to Chat buttons above a selection](media/shots/ai.png)

The extension knows the usual command IDs for VS Code and Cursor. They can be
overridden in Settings for other hosts. If a button calls the wrong command,
**Flintmark: Show AI Log** shows the selected range and the command that was used.

## Supported Markdown

- Headings, emphasis, strikethrough, links, images, blockquotes, lists,
  horizontal rules, inline code, and fenced code blocks.
- GFM tables and task lists.
- `[[wikilinks]]`, aliases, heading and block anchors, and new-note creation for
  unresolved links.
- `#tags`, `==highlights==`, footnotes, and `%% comments %%`.
- Obsidian callouts, including the common aliases and color variants.
- Standard `[ ]` and `[x]` tasks, plus `[/]` in progress, `[-]` cancelled,
  `[>]` forwarded, and `[?]` question.
- YAML frontmatter, KaTeX math, Mermaid diagrams, inline SVG, and Obsidian image
  embeds.

## Install

Install Flintmark from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=quboliu.flintmark),
search for it in the Extensions view, or run:

```sh
code --install-extension quboliu.flintmark
```

VSIX files are also available on the
[GitHub Releases](https://github.com/quboliu/flintmark/releases) page. In VS Code,
choose **Extensions → … → Install from VSIX…**.

Open a Markdown file and accept the prompt to use Flintmark by default. The same
choice is available later as **Flintmark: Set Live Preview as Default Markdown
Editor**. **Switch to Live View** and **Switch to Code View** change the editor
for the current file.

To set the association by hand:

```json
"workbench.editorAssociations": {
  "*.md": "ofm.livePreview",
  "*.markdown": "ofm.livePreview"
}
```

### Zed developer preview

The repository also contains a native Zed extension adapter in
[`editors/zed`](editors/zed). It adds vault-wide wikilink/tag completion,
definition and reference navigation (including backlinks), heading/task
symbols, document links, and Obsidian-oriented snippets to Zed's built-in
Markdown editor. Use Zed's own `markdown: open preview to the side` action for
rendered output.

This is not full UI parity with the VS Code edition: Zed does not currently
expose a custom-editor/webview API, so Flintmark cannot place its caret-aware
Live Preview, interactive widgets, or custom sidebars inside Zed. The adapter
is ready for development installation now; registry publication follows the
first coordinated release. See the [Zed README](editors/zed/README.md) for the
exact feature and install details.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `ofm.theme` | `things` | Theme used by Live Preview. |
| `ofm.lineWidth` | `0` | `0` fills the pane with fixed side padding. Values from `20` to `240` set a centered maximum width in `rem`. |
| `ofm.fontFamily` | theme | Font used for rendered prose. |
| `ofm.fontSize` | `0` | Prose size in pixels. `0` follows the editor size with a small offset. |
| `ofm.monospaceFontFamily` | editor | Font used for code and frontmatter. |
| `ofm.ai.trigger` | `auto` | Start the host's inline AI command after opening the source selection, or only open the selection. |
| `ofm.ai.sourceLayout` | `replace` | Open the source editor in the current group or beside Live Preview. |
| `ofm.ai.chatBridge` | `split` | Use a temporary side editor or briefly switch the current tab when adding text to chat. |
| `ofm.ai.chatCommand` / `ofm.ai.triggerCommand` | auto | Override the command IDs used for the AI buttons. |
| `ofm.ai.debugLog` | `false` | Log the selection handoff for troubleshooting. |

## Files and indexes

Flintmark edits the VS Code `TextDocument`; it does not keep a second copy of a
note or convert it to another format. The note, its links, and its frontmatter
remain in the Markdown file.

The note, tag, backlink, and image indexes are derived from the workspace and
can be rebuilt at any time. Initial scans run in small batches so a large vault
does not hold up the editor, and ordinary saves update only the changed file.

The note used in the dark and light screenshots is
[media/demo/go-pipelines.md](media/demo/go-pipelines.md). It was written as a
demo and draws on the Go blog post
[Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines).

## Building from source

The CI build uses Node.js 20. The extension requires VS Code 1.89 or newer.

```sh
git clone https://github.com/quboliu/flintmark.git
cd flintmark
npm ci
npm run compile
```

Open the repository in VS Code and press `F5` to start an Extension Development
Host.

```sh
npm run lint
npx tsc --noEmit -p .
npm run test:unit
npm run test:perf
npm run test:zed
npm run test:e2e
```

The main screenshots can be regenerated with:

```sh
npm run shots:features
npm run shots:go-pipelines
npm run shots:navigation
```

## Disclaimer

Flintmark is not affiliated with, endorsed by, or sponsored by Obsidian or
Dynalist Inc. “Obsidian” is a trademark of Dynalist Inc. and is used here only
to describe syntax and visual compatibility.

## Credits

- **Things** theme — © Stephan Ango
  ([@kepano](https://github.com/kepano)); Obsidian port maintained by Colin
  Eckert ([@colineckert](https://github.com/colineckert)). It is bundled under
  the MIT License ([source](https://github.com/colineckert/obsidian-things)).
  See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- Built with [CodeMirror 6](https://codemirror.net/),
  [Lezer](https://lezer.codemirror.net/), [KaTeX](https://katex.org/), and
  [Mermaid](https://mermaid.js.org/).

## License

[MIT](LICENSE) © quboliu. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
for bundled third-party software.
