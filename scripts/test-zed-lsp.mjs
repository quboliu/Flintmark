import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const outputRoot = process.env.FLINTMARK_OUT_DIR || "out";
const serverPath = path.resolve(outputRoot, "zed", "flintmark-lsp.cjs");
const child = spawn(process.execPath, [serverPath, "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let input = Buffer.alloc(0);
let nextId = 1;
let stderr = "";
const pending = new Map();

const timeout = setTimeout(() => {
  child.kill();
  throw new Error(`Flintmark LSP smoke test timed out. stderr:\n${stderr}`);
}, 10_000);

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function request(method, params) {
  const id = nextId++;
  send({ id, method, params });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  send({ method, params });
}

function consume() {
  while (input.length > 0) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = input.subarray(0, headerEnd).toString("ascii");
    const match = /^content-length:\s*(\d+)\s*$/im.exec(header);
    assert.ok(match, `server response omitted Content-Length: ${header}`);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) return;
    const message = JSON.parse(input.subarray(bodyStart, bodyEnd).toString("utf8"));
    input = input.subarray(bodyEnd);

    if (message.method === "client/registerCapability") {
      send({ id: message.id, result: null });
      continue;
    }
    if (message.id === undefined) continue;
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  }
}

child.stdout.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  consume();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  const initialized = await request("initialize", { rootUri: null, capabilities: {} });
  assert.equal(initialized.serverInfo.name, "Flintmark");
  notify("initialized", {});
  notify("textDocument/didOpen", {
    textDocument: {
      uri: "file:///vault/Foo.md",
      languageId: "markdown",
      version: 1,
      text: "# Intro\n#project\n",
    },
  });
  notify("textDocument/didOpen", {
    textDocument: {
      uri: "file:///vault/Current.md",
      languageId: "markdown",
      version: 1,
      text: "See [[Fo",
    },
  });

  const completion = await request("textDocument/completion", {
    textDocument: { uri: "file:///vault/Current.md" },
    position: { line: 0, character: 8 },
  });
  assert.ok(completion.items.some((item) => item.label === "Foo"));

  const symbols = await request("textDocument/documentSymbol", {
    textDocument: { uri: "file:///vault/Foo.md" },
  });
  assert.equal(symbols[0].name, "Intro");

  await request("shutdown", null);
  notify("exit", null);
  const exitCode = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(exitCode, 0, stderr);
  console.log("Zed LSP stdio smoke test passed.");
} finally {
  clearTimeout(timeout);
  if (child.exitCode === null) child.kill();
}
