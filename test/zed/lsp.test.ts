import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  applyContentChanges,
  buildDocumentSymbols,
  completionContextAt,
  FlintmarkLanguageServer,
} from "../../src/zed/lspCore";

let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (error) {
    failed++;
    console.error("  ✗ " + name + "\n      " + (error as Error).stack);
  }
}

async function createServer(): Promise<FlintmarkLanguageServer> {
  const server = new FlintmarkLanguageServer();
  await server.handleRequest("initialize", {
    rootUri: "file:///vault",
    capabilities: {},
  });
  server.replaceDocuments([
    {
      uri: "file:///vault/Foo.md",
      text: "# Intro\n\n## Details\n\nParagraph ^block-one\n\n#project\n",
    },
    {
      uri: "file:///vault/folder/Foo.md",
      text: "# Other Foo\n#archive\n",
    },
    {
      uri: "file:///vault/Current.md",
      text: "# Current\n\nSee [[Foo#Intro]] and [[Foo]].\n\n- [ ] Ship it\n\n#project\n",
    },
    {
      uri: "file:///vault/Backlink.md",
      text: "[[Foo#Intro|read this]]\n#project\n",
    },
  ]);
  return server;
}

async function main(): Promise<void> {
await test("initialize advertises the portable Zed feature surface", async () => {
  const server = new FlintmarkLanguageServer();
  const response = (await server.handleRequest("initialize", {
    rootUri: null,
    capabilities: {},
  })) as any;
  assert.equal(response.serverInfo.name, "Flintmark");
  assert.equal(response.capabilities.definitionProvider, true);
  assert.equal(response.capabilities.referencesProvider, true);
  assert.deepEqual(response.capabilities.completionProvider.triggerCharacters, ["[", "#", "^"]);
});

await test("completion contexts distinguish notes, headings, blocks, and tags", () => {
  assert.deepEqual(completionContextAt("See [[Fo", 8), {
    kind: "note",
    query: "Fo",
    from: 6,
    to: 8,
  });
  assert.deepEqual(completionContextAt("[[Foo#In", 8), {
    kind: "heading",
    target: "Foo",
    query: "In",
    from: 6,
    to: 8,
  });
  assert.deepEqual(completionContextAt("[[Foo#^bl", 9), {
    kind: "block",
    target: "Foo",
    query: "bl",
    from: 7,
    to: 9,
  });
  assert.deepEqual(completionContextAt("Use #pro", 8), {
    kind: "tag",
    query: "pro",
    from: 5,
    to: 8,
  });
  assert.equal(completionContextAt("# Heading", 9), null);
});

await test("note completion disambiguates duplicate basenames with vault paths", async () => {
  const server = await createServer();
  await server.handleNotification("textDocument/didOpen", {
    textDocument: {
      uri: "file:///vault/Scratch.md",
      version: 1,
      text: "See [[Fo",
    },
  });
  const response = (await server.handleRequest("textDocument/completion", {
    textDocument: { uri: "file:///vault/Scratch.md" },
    position: { line: 0, character: 8 },
  })) as any;
  assert.deepEqual(
    response.items.map((item: any) => item.label),
    ["Foo", "folder/Foo"]
  );
  assert.equal(response.items[0].textEdit.newText, "Foo]]");
});

await test("heading, block-anchor, and tag completions use the shared vault", async () => {
  const server = await createServer();
  await server.handleNotification("textDocument/didOpen", {
    textDocument: {
      uri: "file:///vault/Scratch.md",
      version: 1,
      text: "[[Foo#In\n[[Foo#^bl\n#pro",
    },
  });
  const heading = (await server.handleRequest("textDocument/completion", {
    textDocument: { uri: "file:///vault/Scratch.md" },
    position: { line: 0, character: 8 },
  })) as any;
  assert.ok(heading.items.some((item: any) => item.label === "Intro"));

  const block = (await server.handleRequest("textDocument/completion", {
    textDocument: { uri: "file:///vault/Scratch.md" },
    position: { line: 1, character: 10 },
  })) as any;
  assert.ok(block.items.some((item: any) => item.label === "block-one"));

  const tag = (await server.handleRequest("textDocument/completion", {
    textDocument: { uri: "file:///vault/Scratch.md" },
    position: { line: 2, character: 4 },
  })) as any;
  assert.deepEqual(tag.items.map((item: any) => item.label), ["#project"]);
});

await test("definition resolves a wikilink heading to its source line", async () => {
  const server = await createServer();
  const definition = (await server.handleRequest("textDocument/definition", {
    textDocument: { uri: "file:///vault/Current.md" },
    position: { line: 2, character: 8 },
  })) as any;
  assert.equal(definition.uri, "file:///vault/Foo.md");
  assert.equal(definition.range.start.line, 0);
});

await test("references return heading-specific backlinks and the declaration", async () => {
  const server = await createServer();
  const references = (await server.handleRequest("textDocument/references", {
    textDocument: { uri: "file:///vault/Current.md" },
    position: { line: 2, character: 10 },
    context: { includeDeclaration: true },
  })) as any[];
  assert.deepEqual(
    references.map((location) => [location.uri, location.range.start.line]),
    [
      ["file:///vault/Current.md", 2],
      ["file:///vault/Backlink.md", 0],
      ["file:///vault/Foo.md", 0],
    ]
  );
});

await test("tag references find the tag across the workspace", async () => {
  const server = await createServer();
  const references = (await server.handleRequest("textDocument/references", {
    textDocument: { uri: "file:///vault/Current.md" },
    position: { line: 6, character: 2 },
    context: { includeDeclaration: false },
  })) as any[];
  assert.deepEqual(
    references.map((location) => location.uri),
    ["file:///vault/Foo.md", "file:///vault/Current.md", "file:///vault/Backlink.md"]
  );
});

await test("document symbols preserve heading hierarchy and nest tasks", () => {
  const symbols = buildDocumentSymbols(
    "# Project\n\n- [ ] top task\n\n## Details\n\n- [x] nested task\n"
  ) as any[];
  assert.equal(symbols.length, 1);
  assert.equal(symbols[0].name, "Project");
  assert.equal(symbols[0].children[0].name, "[ ] top task");
  assert.equal(symbols[0].children[1].name, "Details");
  assert.equal(symbols[0].children[1].children[0].name, "[x] nested task");
});

await test("document links expose resolved wikilinks to Zed", async () => {
  const server = await createServer();
  const links = (await server.handleRequest("textDocument/documentLink", {
    textDocument: { uri: "file:///vault/Current.md" },
  })) as any[];
  assert.equal(links.length, 2);
  assert.ok(links.every((link) => link.target === "file:///vault/Foo.md"));
});

await test("workspace scan indexes Markdown without entering Obsidian metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "flintmark-zed-lsp-"));
  try {
    await mkdir(path.join(root, "notes"));
    await mkdir(path.join(root, ".obsidian"));
    await writeFile(path.join(root, "notes", "Found.md"), "# Found\n", "utf8");
    await writeFile(path.join(root, ".obsidian", "Hidden.md"), "# Hidden\n", "utf8");

    let scanComplete!: () => void;
    const scanned = new Promise<void>((resolve) => {
      scanComplete = resolve;
    });
    const server = new FlintmarkLanguageServer({
      notify(method, params: any) {
        if (method === "window/logMessage" && params?.message?.includes("Indexed")) {
          scanComplete();
        }
      },
      async request() {
        return null;
      },
    });
    await server.handleRequest("initialize", {
      rootUri: pathToFileURL(root).href,
      capabilities: {},
    });
    await server.handleNotification("initialized", {});
    let scanTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        scanned,
        new Promise<never>((_, reject) => {
          scanTimeout = setTimeout(() => reject(new Error("workspace scan timed out")), 3000);
        }),
      ]);
    } finally {
      if (scanTimeout) clearTimeout(scanTimeout);
    }
    await server.handleNotification("textDocument/didOpen", {
      textDocument: {
        uri: pathToFileURL(path.join(root, "Scratch.md")).href,
        version: 1,
        text: "[[",
      },
    });
    const completion = (await server.handleRequest("textDocument/completion", {
      textDocument: { uri: pathToFileURL(path.join(root, "Scratch.md")).href },
      position: { line: 0, character: 2 },
    })) as any;
    assert.ok(completion.items.some((item: any) => item.label === "Found"));
    assert.ok(!completion.items.some((item: any) => item.label === "Hidden"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test("full and incremental LSP content changes are both safe", () => {
  assert.equal(applyContentChanges("old", [{ text: "new" }]), "new");
  assert.equal(
    applyContentChanges("one\ntwo", [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 3 },
        },
        text: "three",
      },
    ]),
    "one\nthree"
  );
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll Zed LSP tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
