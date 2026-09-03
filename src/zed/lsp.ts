import { FlintmarkLanguageServer, type LspPeer, LspResponseError } from "./lspCore";

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let input = Buffer.alloc(0);
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve(value: unknown): void; reject(error: Error): void }
>();

function writeMessage(message: JsonRpcMessage): void {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

const peer: LspPeer = {
  notify(method, params) {
    writeMessage({ method, params });
  },
  request(method, params) {
    const id = nextRequestId++;
    writeMessage({ id, method, params });
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  },
};

const server = new FlintmarkLanguageServer(peer);

async function dispatch(message: JsonRpcMessage): Promise<void> {
  if (typeof message.method !== "string") {
    if (typeof message.id !== "number") return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }

  if (message.id !== undefined && message.id !== null) {
    try {
      const result = await server.handleRequest(message.method, message.params);
      writeMessage({ id: message.id, result });
    } catch (error) {
      const responseError =
        error instanceof LspResponseError
          ? error
          : new LspResponseError(
              -32603,
              error instanceof Error ? error.message : String(error)
            );
      writeMessage({
        id: message.id,
        error: {
          code: responseError.code,
          message: responseError.message,
          data: responseError.data,
        },
      });
    }
    return;
  }

  try {
    const result = await server.handleNotification(message.method, message.params);
    if (result === "exit") process.exit(server.exitCode());
  } catch (error) {
    process.stderr.write(
      `Flintmark notification ${message.method} failed: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }\n`
    );
  }
}

function consumeInput(): void {
  while (input.length > 0) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = input.subarray(0, headerEnd).toString("ascii");
    const match = /^content-length:\s*(\d+)\s*$/im.exec(header);
    if (!match) {
      process.stderr.write("Flintmark received an LSP frame without Content-Length.\n");
      input = input.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) return;
    const body = input.subarray(bodyStart, bodyEnd).toString("utf8");
    input = input.subarray(bodyEnd);
    try {
      const message = JSON.parse(body) as JsonRpcMessage;
      void dispatch(message);
    } catch (error) {
      writeMessage({
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Invalid JSON",
        },
      });
    }
  }
}

process.stdin.on("data", (chunk: Buffer) => {
  input = Buffer.concat([input, chunk]);
  consumeInput();
});
process.stdin.on("error", (error) => {
  process.stderr.write(`Flintmark LSP input failed: ${error.message}\n`);
  process.exitCode = 1;
});
process.stdin.resume();
