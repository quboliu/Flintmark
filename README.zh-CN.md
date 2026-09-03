<p align="center">
  <img src="media/icon.png" width="96" alt="Flintmark 图标">
</p>

<h1 align="center">Flintmark</h1>

<p align="center">
  <strong>VS Code 里的 Obsidian 风格 Markdown 实时预览。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#实际效果">实际效果</a> ·
  <a href="#支持的-markdown">支持语法</a> ·
  <a href="#安装">安装</a> ·
  <a href="#设置">设置</a> ·
  <a href="#本地开发">本地开发</a>
</p>

<p align="center">
  <a href="https://github.com/quboliu/flintmark/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/quboliu/flintmark/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/quboliu/flintmark/releases"><img alt="最新版本" src="https://img.shields.io/github/v/release/quboliu/flintmark?label=release"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=quboliu.flintmark"><img alt="VS Code Marketplace" src="https://img.shields.io/visual-studio-marketplace/v/quboliu.flintmark?label=VS%20Code%20Marketplace"></a>
  <img alt="VS Code 1.89+" src="https://img.shields.io/badge/VS_Code-1.89%2B-007ACC?logo=visualstudiocode&logoColor=white">
  <a href="LICENSE"><img alt="MIT 许可" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

Flintmark 是一个 VS Code Markdown 自定义编辑器。平时看到的是排版后的内容；光标落到
某一行或区块时，那里才显示 Markdown 源码。写和看都在同一个标签页里，磁盘上的文件仍然
是普通 `.md`。

如果你习惯用 VS Code 打开 Obsidian 知识库，Flintmark 还补上了 wikilink 和标签补全、
Properties、图片嵌入、Outline、Todo、Backlinks 这些常用功能。

![Flintmark 中打开的技术笔记，包含 Properties、callout、表格和 Go 代码](media/shots/go-pipelines-dark.png)

## 实际效果

下面的截图来自仓库代码启动的 VSCodium Extension Development Host。

### 深色和浅色主题

Flintmark 跟随 VS Code 当前的颜色模式。切换主题时直接换色，不会重开编辑器，光标和滚动
位置也不会动。

<table>
  <tr>
    <td width="50%"><img src="media/shots/go-pipelines-dark.png" alt="深色主题下的 Flintmark"></td>
    <td width="50%"><img src="media/shots/go-pipelines-light.png" alt="浅色主题下的 Flintmark"></td>
  </tr>
  <tr>
    <td align="center"><strong>深色</strong></td>
    <td align="center"><strong>浅色</strong></td>
  </tr>
</table>

### 点进去就能改

点击已经渲染的内容，对应行会切回 Markdown；光标移开后重新渲染。任务框可以直接勾选，
代码块在非编辑状态下保留语法高亮和 Copy 按钮。

加粗、斜体、行内代码、删除线和链接都有快捷键。选中一段文字再粘贴 URL，会自动变成
Markdown 链接。

![在 Flintmark 中编辑任务和 JavaScript 代码块](media/shots/editing.png)

输入 `[[` 补全库里的笔记，输入 `#` 补全标签，输入 `[[#` 补全当前笔记的标题。工作区
文件有变化时，补全列表也会跟着更新。

![Flintmark 中的 wikilink 补全](media/shots/autocomplete.png)

### Properties

Flintmark 会把简单的 YAML frontmatter 收成 Properties 面板。日期、列表、标签使用不同
图标，数组和标签显示为 chips。点击面板即可编辑原始 YAML；遇到暂时解析不了的复杂写法，
则照原文显示，不会硬套成表格。

![Frontmatter 显示为 Properties 面板](media/shots/properties.png)

### Outline、Todo 和 Backlinks

VS Code 内置的 Markdown Outline 读不到 Webview 自定义编辑器，所以 Flintmark 自带三块
侧栏：

- **Outline**：显示当前笔记的标题层级。
- **Todo**：按原文顺序列出所有标准和扩展任务状态。
- **Backlinks**：列出链接到当前笔记的其他笔记。

点击 Outline 或 Todo 中的一项，光标会直接跳到实时预览里的对应行。

![笔记旁边同时打开 Outline、Todo 和 Backlinks](media/shots/navigation.png)

### Markdown 渲染

<table>
  <tr>
    <td width="50%">
      <strong>Callout</strong><br>
      常见 Obsidian callout 类型和别名有各自的配色。<br><br>
      <img src="media/shots/callouts.png" alt="Note、tip、warning 和 important callout">
    </td>
    <td width="50%">
      <strong>任务状态</strong><br>
      除了未完成和已完成，也支持进行中、取消、转交和待确认。<br><br>
      <img src="media/shots/tasks.png" alt="标准和扩展 Markdown 任务状态">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>代码块</strong><br>
      30 多种语言可以高亮，每个代码块都有 Copy 按钮。<br><br>
      <img src="media/shots/code.png" alt="带语法高亮的 SQL 和 Python 代码块">
    </td>
    <td width="50%">
      <strong>GFM 表格</strong><br>
      单元格里的粗体、斜体、代码、链接和高亮也能正常显示。<br><br>
      <img src="media/shots/table.png" alt="渲染后的 GFM 表格">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>公式</strong><br>
      行内公式和块公式都使用 KaTeX 渲染。<br><br>
      <img src="media/shots/math.png" alt="KaTeX 渲染的行内公式和块公式">
    </td>
    <td width="50%">
      <strong>Mermaid</strong><br>
      Mermaid 代码块显示为图表，编辑时切回源码。<br><br>
      <img src="media/shots/mermaid.png" alt="Mermaid 流程图">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>行内语法</strong><br>
      Wikilink、标签、高亮、脚注、注释和行内代码。<br><br>
      <img src="media/shots/inline.png" alt="Wikilink、标签、高亮、脚注和行内代码">
    </td>
    <td width="50%">
      <strong>图片</strong><br>
      支持标准 Markdown 图片和跨目录的 <code>![[embed]]</code>。<br><br>
      <img src="media/shots/images.png" alt="从附件目录解析出的图片 embed">
    </td>
  </tr>
</table>

引用、有序和无序列表、分隔线、Setext 标题、脚注定义以及经过清理的内联 SVG 也可以
渲染。`%% 注释 %%` 平时隐藏，光标移进去才显示。

### 图片和附件

把图片粘贴或拖进编辑区，Flintmark 会把文件存到笔记旁边，并插入
`![[image-name.ext]]`。文件名中会破坏 wikilink 的字符会被清理；如果已经有同名文件，
则换一个名字，不会覆盖。格式不支持或文件过大时会弹出提示。

图片可以只写文件名，由 Flintmark 在整个知识库里查找。尺寸写法是
`![[image.png|200]]` 或 `![[image.png|200x120]]`。

### Copilot 和 Cursor

Webview 里的选区通常不会被 Copilot 或 Cursor 看见。Flintmark 在选中文字后显示一个小
工具栏：

- **Edit**：在源码编辑器中打开同一段文字；默认还会启动宿主的行内 AI 命令。
- **Add to Chat**：把这段文字附加到宿主的聊天或 composer。

![选区上方的 Edit 和 Add to Chat 按钮](media/shots/ai.png)

VS Code 和 Cursor 常用的命令 ID 已经内置，其他宿主可以在设置中覆盖。如果按钮没有调起
正确的命令，运行 **Flintmark: Show AI Log** 查看选区和实际调用的命令。

## 支持的 Markdown

- 标题、粗体、斜体、删除线、链接、图片、引用、列表、分隔线、行内代码和 fenced code。
- GFM 表格和任务列表。
- `[[wikilink]]`、别名、标题/块锚点；点击未解析链接还可以新建笔记。
- `#标签`、`==高亮==`、脚注和 `%% 注释 %%`。
- Obsidian callout，包括常见别名和配色。
- 标准 `[ ]` / `[x]` 任务，以及 `[/]` 进行中、`[-]` 已取消、`[>]` 已转交、
  `[?]` 待确认。
- YAML frontmatter、KaTeX 公式、Mermaid、内联 SVG 和 Obsidian 图片 embed。

## 安装

可以从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=quboliu.flintmark)
安装，也可以在扩展视图里搜索 **Flintmark**，或运行：

```sh
code --install-extension quboliu.flintmark
```

[GitHub Releases](https://github.com/quboliu/flintmark/releases) 里也有 VSIX 文件。
下载后，在 VS Code 中选择 **Extensions → … → Install from VSIX…**。

第一次打开 Markdown 文件时，可以按提示将 Flintmark 设为默认编辑器。之后也能从命令面板
运行 **Flintmark: Set Live Preview as Default Markdown Editor**。
**Switch to Live View** 和 **Switch to Code View** 用来切换当前文件的打开方式。

也可以直接写进设置：

```json
"workbench.editorAssociations": {
  "*.md": "ofm.livePreview",
  "*.markdown": "ofm.livePreview"
}
```

### Zed 开发预览

仓库现在也包含原生 Zed 扩展适配层：[`editors/zed`](editors/zed)。它在 Zed 内置
Markdown 编辑器上提供全库 wikilink/标签补全、定义跳转、引用与反链、标题/任务 Outline、
可点击文档链接以及 Obsidian 常用片段；渲染结果使用 Zed 自带的
`markdown: open preview to the side`。

这不是 VS Code 版 UI 的完全复刻：Zed 当前还没有向扩展开放自定义编辑器/Webview，因而
无法承载 Flintmark 的光标感知行内 Live Preview、交互式 widget 和自定义侧栏。适配层已经
可以用开发模式安装，首个协同版本发布后再进入 Zed 扩展仓库。功能边界和安装步骤见
[Zed README](editors/zed/README.md)。

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ofm.theme` | `things` | 实时预览使用的主题。 |
| `ofm.lineWidth` | `0` | `0` 表示填满窗格并保留固定边距；`20`–`240` 表示居中后的最大宽度，单位为 `rem`。 |
| `ofm.fontFamily` | 主题 | 渲染后正文使用的字体。 |
| `ofm.fontSize` | `0` | 正文字号，单位为 px；`0` 表示在编辑器字号上稍作调整。 |
| `ofm.monospaceFontFamily` | 编辑器 | 代码和 frontmatter 使用的字体。 |
| `ofm.ai.trigger` | `auto` | 打开源码选区后启动宿主的行内 AI，或只负责打开选区。 |
| `ofm.ai.sourceLayout` | `replace` | 在当前编辑组或实时预览旁边打开源码。 |
| `ofm.ai.chatBridge` | `split` | 附加到聊天时使用临时侧边编辑器，或短暂切换当前标签页。 |
| `ofm.ai.chatCommand` / `ofm.ai.triggerCommand` | 自动 | 覆盖 AI 按钮调用的宿主命令 ID。 |
| `ofm.ai.debugLog` | `false` | 记录 AI 按钮使用的选区和命令，便于排查问题。 |

## 文件和索引

Flintmark 直接编辑 VS Code 的 `TextDocument`，不会另存一份笔记，也不会转换成其他格式。
链接、frontmatter 等内容都留在原来的 Markdown 文件里。

笔记、标签、反向链接和图片索引都是根据工作区临时生成的，随时可以重建。第一次扫描会
分批进行，不会等整库扫完才打开编辑器；平时保存文件时，也只更新发生变化的那一篇。

深浅主题截图使用的笔记是
[media/demo/go-pipelines.md](media/demo/go-pipelines.md)。这是一篇为截图编写的演示文档，
参考了 Go 官方博客的
[Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines)。

## 本地开发

CI 使用 Node.js 20；扩展要求 VS Code 1.89 或更高版本。

```sh
git clone https://github.com/quboliu/flintmark.git
cd flintmark
npm ci
npm run compile
```

用 VS Code 打开仓库，按 `F5` 启动 Extension Development Host。

```sh
npm run lint
npx tsc --noEmit -p .
npm run test:unit
npm run test:perf
npm run test:zed
npm run test:e2e
```

README 里的主要截图可以用下面的命令重新生成：

```sh
npm run shots:features
npm run shots:go-pipelines
npm run shots:navigation
```

## 声明

Flintmark 与 Obsidian / Dynalist Inc. 没有隶属、赞助或背书关系。“Obsidian” 是
Dynalist Inc. 的商标，这里只用于说明语法和视觉上的兼容性。

## 致谢

- **Things** 主题——© Stephan Ango
  （[@kepano](https://github.com/kepano)）；Obsidian 移植版由 Colin Eckert
  （[@colineckert](https://github.com/colineckert)）维护。Flintmark 按 MIT License
  内置该主题（[source](https://github.com/colineckert/obsidian-things)）。完整声明见
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
- 使用了 [CodeMirror 6](https://codemirror.net/)、
  [Lezer](https://lezer.codemirror.net/)、[KaTeX](https://katex.org/) 和
  [Mermaid](https://mermaid.js.org/)。

## 许可

[MIT](LICENSE) © quboliu。内置第三方软件见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
