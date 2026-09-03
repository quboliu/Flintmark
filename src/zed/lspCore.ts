import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import packageJson from "../../package.json";
import { parseDocumentStructure } from "../extension/documentStructureParser";
import { parseNote, type WikiLinkRef } from "../extension/vault/linkParser";
import { VaultIndex } from "../extension/vault/vaultIndex";

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface WorkspaceDocument {
  uri: string;
  text: string;
  version?: number;
}

export interface LspPeer {
  notify(method: string, params: unknown): void;
  request(method: string, params: unknown): Promise<unknown>;
}

interface DocumentState extends WorkspaceDocument {
  open: boolean;
}

interface LinkDestination {
  target: string;
  kind: "heading" | "block" | null;
  subpath: string | null;
}

export type FlintmarkCompletionContext =
  | {
      kind: "note";
      query: string;
      from: number;
      to: number;
    }
  | {
      kind: "heading" | "block";
      target: string;
      query: string;
      from: number;
      to: number;
    }
  | {
      kind: "tag";
      query: string;
      from: number;
      to: number;
    };

const MARKDOWN_SUFFIXES = new Set([".md", ".markdown"]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".obsidian",
  ".svn",
  ".trash",
  "node_modules",
]);
const MAX_NOTE_BYTES = 8 * 1024 * 1024;
const MAX_NOTE_COUNT = 100_000;
const MAX_COMPLETIONS = 200;
const MAX_WORKSPACE_SYMBOLS = 400;

const SYMBOL_KIND = {
  file: 1,
  string: 15,
  boolean: 17,
} as const;

const COMPLETION_KIND = {
  keyword: 14,
  file: 17,
  reference: 18,
} as const;

export class LspResponseError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = "LspResponseError";
  }
}

const silentPeer: LspPeer = {
  notify() {},
  async request() {
    return null;
  },
};

/**
 * Flintmark's headless Zed surface. The VS Code custom editor cannot be hosted
 * by Zed, so this server exposes the portable vault intelligence through LSP.
 */
export class FlintmarkLanguageServer {
  private readonly peer: LspPeer;
  private documents = new Map<string, DocumentState>();
  private vault = new VaultIndex([]);
  private workspaceRoots: string[] = [];
  private scanGeneration = 0;
  private scanning = false;
  private shutdownRequested = false;

  constructor(peer: LspPeer = silentPeer) {
    this.peer = peer;
  }

  async handleRequest(method: string, params: any): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.initialize(params ?? {});
      case "shutdown":
        this.shutdownRequested = true;
        return null;
      case "textDocument/completion":
        return this.completion(params);
      case "textDocument/definition":
        return this.definition(params);
      case "textDocument/references":
        return this.references(params);
      case "textDocument/hover":
        return this.hover(params);
      case "textDocument/documentSymbol":
        return this.documentSymbols(params);
      case "textDocument/documentLink":
        return this.documentLinks(params);
      case "workspace/symbol":
        return this.workspaceSymbols(params);
      default:
        throw new LspResponseError(-32601, `Method not found: ${method}`);
    }
  }

  async handleNotification(method: string, params: any): Promise<"exit" | void> {
    switch (method) {
      case "initialized":
        this.registerFileWatcher();
        this.scheduleWorkspaceScan();
        return;
      case "exit":
        return "exit";
      case "textDocument/didOpen":
        this.didOpen(params);
        return;
      case "textDocument/didChange":
        this.didChange(params);
        return;
      case "textDocument/didSave":
        await this.didSave(params);
        return;
      case "textDocument/didClose":
        await this.didClose(params);
        return;
      case "workspace/didChangeWatchedFiles":
        await this.didChangeWatchedFiles(params);
        return;
      case "workspace/didChangeWorkspaceFolders":
        this.didChangeWorkspaceFolders(params);
        return;
      default:
        return;
    }
  }

  exitCode(): number {
    return this.shutdownRequested ? 0 : 1;
  }

  /** Deterministic index injection for unit tests and embedders. */
  replaceDocuments(documents: readonly WorkspaceDocument[]): void {
    this.documents = new Map(
      documents.map((document) => {
        const uri = normalizeUri(document.uri);
        return [
          uri,
          {
            uri,
            text: document.text,
            version: document.version,
            open: false,
          },
        ];
      })
    );
    this.rebuildVault();
  }

  private initialize(params: any): unknown {
    const roots: string[] = [];
    if (Array.isArray(params.workspaceFolders)) {
      for (const folder of params.workspaceFolders) {
        if (typeof folder?.uri === "string" && isFileUri(folder.uri)) {
          roots.push(normalizeUri(folder.uri));
        }
      }
    }
    if (roots.length === 0 && typeof params.rootUri === "string" && isFileUri(params.rootUri)) {
      roots.push(normalizeUri(params.rootUri));
    }
    this.workspaceRoots = unique(roots);

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 1,
          save: { includeText: false },
        },
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ["[", "#", "^"],
        },
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        documentSymbolProvider: true,
        documentLinkProvider: { resolveProvider: false },
        workspaceSymbolProvider: true,
        workspace: {
          workspaceFolders: {
            supported: true,
            changeNotifications: true,
          },
        },
      },
      serverInfo: {
        name: "Flintmark",
        version: packageJson.version,
      },
    };
  }

  private registerFileWatcher(): void {
    void this.peer
      .request("client/registerCapability", {
        registrations: [
          {
            id: "flintmark-markdown-files",
            method: "workspace/didChangeWatchedFiles",
            registerOptions: {
              watchers: [
                { globPattern: "**/*.md" },
                { globPattern: "**/*.markdown" },
              ],
            },
          },
        ],
      })
      .catch((error) => {
        this.log(2, `Unable to register Markdown file watching: ${errorMessage(error)}`);
      });
  }

  private scheduleWorkspaceScan(): void {
    const generation = ++this.scanGeneration;
    this.scanning = true;
    void this.scanWorkspace(generation).catch((error) => {
      if (generation !== this.scanGeneration) return;
      this.scanning = false;
      this.log(1, `Vault scan failed: ${errorMessage(error)}`);
    });
  }

  private async scanWorkspace(generation: number): Promise<void> {
    const found = new Map<string, DocumentState>();
    let limitReached = false;

    const visit = async (directory: string): Promise<void> => {
      if (generation !== this.scanGeneration || found.size >= MAX_NOTE_COUNT) {
        limitReached = found.size >= MAX_NOTE_COUNT;
        return;
      }

      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (generation !== this.scanGeneration) return;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(entryPath);
          continue;
        }
        if (!entry.isFile() || !isMarkdownPath(entryPath)) continue;
        if (found.size >= MAX_NOTE_COUNT) {
          limitReached = true;
          return;
        }

        const document = await readMarkdownDocument(entryPath);
        if (document) found.set(document.uri, document);
      }
    };

    for (const root of this.workspaceRoots) {
      const rootPath = filePathFromUri(root);
      if (rootPath) await visit(rootPath);
    }

    if (generation !== this.scanGeneration) return;

    for (const document of this.documents.values()) {
      if (document.open) found.set(document.uri, document);
    }
    this.documents = found;
    this.rebuildVault();
    this.scanning = false;

    if (limitReached) {
      this.log(2, `Vault indexing stopped at ${MAX_NOTE_COUNT.toLocaleString()} Markdown files.`);
    } else {
      this.log(3, `Indexed ${found.size.toLocaleString()} Markdown files.`);
    }
  }

  private didOpen(params: any): void {
    const item = params?.textDocument;
    if (typeof item?.uri !== "string" || typeof item?.text !== "string") return;
    const uri = normalizeUri(item.uri);
    this.upsertDocument({
      uri,
      text: item.text,
      version: typeof item.version === "number" ? item.version : undefined,
      open: true,
    });
  }

  private didChange(params: any): void {
    const item = params?.textDocument;
    if (typeof item?.uri !== "string" || !Array.isArray(params?.contentChanges)) return;
    const uri = normalizeUri(item.uri);
    const previous = this.documents.get(uri);
    const text = applyContentChanges(previous?.text ?? "", params.contentChanges);
    this.upsertDocument({
      uri,
      text,
      version: typeof item.version === "number" ? item.version : previous?.version,
      open: true,
    });
  }

  private async didSave(params: any): Promise<void> {
    const uriValue = params?.textDocument?.uri;
    if (typeof uriValue !== "string") return;
    const uri = normalizeUri(uriValue);
    if (typeof params?.text === "string") {
      const previous = this.documents.get(uri);
      this.upsertDocument({
        uri,
        text: params.text,
        version: previous?.version,
        open: previous?.open ?? true,
      });
      return;
    }

    const disk = await readMarkdownUri(uri);
    if (!disk) return;
    const previous = this.documents.get(uri);
    this.upsertDocument({ ...disk, version: previous?.version, open: previous?.open ?? true });
  }

  private async didClose(params: any): Promise<void> {
    const uriValue = params?.textDocument?.uri;
    if (typeof uriValue !== "string") return;
    const uri = normalizeUri(uriValue);
    const disk = await readMarkdownUri(uri);
    if (disk) {
      this.upsertDocument({ ...disk, open: false });
      return;
    }
    if (this.documents.delete(uri)) this.rebuildVault();
  }

  private async didChangeWatchedFiles(params: any): Promise<void> {
    if (!Array.isArray(params?.changes)) return;
    let structuralChange = false;

    for (const change of params.changes) {
      if (typeof change?.uri !== "string") continue;
      const uri = normalizeUri(change.uri);
      const existing = this.documents.get(uri);
      if (change.type === 3) {
        if (!existing?.open && this.documents.delete(uri)) structuralChange = true;
        continue;
      }
      if (existing?.open) continue;
      const disk = await readMarkdownUri(uri);
      if (!disk) continue;
      if (!existing) structuralChange = true;
      this.documents.set(uri, { ...disk, open: false });
      if (!structuralChange) this.vault.replaceNoteContent({ path: uri, text: disk.text });
    }

    if (structuralChange) this.rebuildVault();
  }

  private didChangeWorkspaceFolders(params: any): void {
    const removed = new Set<string>();
    for (const folder of params?.event?.removed ?? []) {
      if (typeof folder?.uri === "string") removed.add(normalizeUri(folder.uri));
    }
    const roots = this.workspaceRoots.filter((root) => !removed.has(root));
    for (const folder of params?.event?.added ?? []) {
      if (typeof folder?.uri === "string" && isFileUri(folder.uri)) {
        roots.push(normalizeUri(folder.uri));
      }
    }
    this.workspaceRoots = unique(roots);
    this.scheduleWorkspaceScan();
  }

  private upsertDocument(document: DocumentState): void {
    const existed = this.documents.has(document.uri);
    this.documents.set(document.uri, document);
    if (!existed || !this.vault.replaceNoteContent({ path: document.uri, text: document.text })) {
      this.rebuildVault();
    }
  }

  private rebuildVault(): void {
    this.vault = new VaultIndex(
      [...this.documents.values()].map((document) => ({
        path: document.uri,
        text: document.text,
      }))
    );
  }

  private completion(params: any): unknown {
    const document = this.documentForParams(params);
    const position = positionFromParams(params);
    if (!document || !position) return { isIncomplete: this.scanning, items: [] };

    const offset = offsetAt(document.text, position);
    const context = completionContextAt(document.text, offset);
    if (!context) return { isIncomplete: this.scanning, items: [] };

    let items: any[] = [];
    if (context.kind === "note") {
      const counts = new Map<string, number>();
      for (const note of this.vault.getAllNotes()) {
        const key = note.name.toLocaleLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const candidates = this.vault
        .getAllNotes()
        .map((note) => {
          const relative = this.displayPath(note.path);
          const target =
            (counts.get(note.name.toLocaleLowerCase()) ?? 0) > 1
              ? stripMarkdownExtension(relative)
              : note.name;
          return {
            note,
            relative,
            target,
            score: matchScore(target, context.query),
          };
        })
        .filter((candidate) => candidate.score < 10)
        .sort(compareCandidates)
        .slice(0, MAX_COMPLETIONS);

      items = candidates.map((candidate, index) => ({
        label: candidate.target,
        detail: candidate.relative,
        kind: COMPLETION_KIND.file,
        sortText: sortText(candidate.score, index),
        filterText: `${candidate.target} ${candidate.relative}`,
        textEdit: {
          range: rangeFromOffsets(document.text, context.from, context.to),
          newText: completeWikiText(candidate.target, document.text, context.to),
        },
      }));
    } else if (context.kind === "tag") {
      items = this.vault
        .getAllTags()
        .map((tag) => ({ tag, score: matchScore(tag, context.query) }))
        .filter(
          (candidate) =>
            candidate.score < 10 &&
            (!context.query ||
              candidate.tag.toLocaleLowerCase() !== context.query.toLocaleLowerCase())
        )
        .sort(compareCandidates)
        .slice(0, MAX_COMPLETIONS)
        .map((candidate, index) => ({
          label: `#${candidate.tag}`,
          detail: "Flintmark vault tag",
          kind: COMPLETION_KIND.keyword,
          sortText: sortText(candidate.score, index),
          textEdit: {
            range: rangeFromOffsets(document.text, context.from, context.to),
            newText: candidate.tag,
          },
        }));
    } else {
      const targetUri = context.target
        ? this.vault.resolveLink(context.target)
        : document.uri;
      const targetDocument = targetUri ? this.documents.get(targetUri) : undefined;
      if (targetDocument) {
        const values =
          context.kind === "heading"
            ? parseDocumentStructure(targetDocument.text).headings.map((heading) => heading.text)
            : parseBlockAnchors(targetDocument.text).map((anchor) => anchor.name);
        items = uniqueCaseInsensitive(values)
          .map((value) => ({ value, score: matchScore(value, context.query) }))
          .filter((candidate) => candidate.score < 10)
          .sort(compareCandidates)
          .slice(0, MAX_COMPLETIONS)
          .map((candidate, index) => ({
            label: candidate.value,
            detail:
              context.kind === "heading" ? "Markdown heading" : "Obsidian block anchor",
            kind: COMPLETION_KIND.reference,
            sortText: sortText(candidate.score, index),
            textEdit: {
              range: rangeFromOffsets(document.text, context.from, context.to),
              newText: completeWikiText(candidate.value, document.text, context.to),
            },
          }));
      }
    }

    return { isIncomplete: this.scanning, items };
  }

  private definition(params: any): unknown {
    const document = this.documentForParams(params);
    const position = positionFromParams(params);
    if (!document || !position) return null;
    const link = linkAt(document.text, offsetAt(document.text, position));
    if (!link) return null;
    const destination = parseLinkDestination(link.raw);
    const targetUri = destination.target
      ? this.vault.resolveLink(destination.target)
      : document.uri;
    if (!targetUri) return null;
    const target = this.documents.get(targetUri);
    return {
      uri: targetUri,
      range: target
        ? subpathRange(target.text, destination.kind, destination.subpath)
        : zeroRange(),
    };
  }

  private references(params: any): unknown {
    const document = this.documentForParams(params);
    const position = positionFromParams(params);
    if (!document || !position) return [];
    const offset = offsetAt(document.text, position);

    const tag = tagAt(document.text, offset);
    if (tag) return this.tagReferences(tag.tag);

    const selectedLink = linkAt(document.text, offset);
    let targetUri = document.uri;
    let requestedKind: LinkDestination["kind"] = null;
    let requestedSubpath: string | null = null;
    if (selectedLink) {
      const destination = parseLinkDestination(selectedLink.raw);
      targetUri = destination.target
        ? this.vault.resolveLink(destination.target) ?? ""
        : document.uri;
      requestedKind = destination.kind;
      requestedSubpath = destination.subpath;
    } else {
      const heading = parseDocumentStructure(document.text).headings.find(
        (candidate) => candidate.line === position.line
      );
      if (heading) {
        requestedKind = "heading";
        requestedSubpath = heading.text;
      }
    }
    if (!targetUri) return [];

    const locations: any[] = [];
    const seen = new Set<string>();
    for (const source of this.documents.values()) {
      for (const link of parseNote(source.text).links) {
        const destination = parseLinkDestination(link.raw);
        const resolved = destination.target
          ? this.vault.resolveLink(destination.target)
          : source.uri;
        if (resolved !== targetUri) continue;
        if (
          requestedSubpath &&
          (destination.kind !== requestedKind ||
            normalizeReference(destination.subpath ?? "") !==
              normalizeReference(requestedSubpath))
        ) {
          continue;
        }
        pushUniqueLocation(
          locations,
          seen,
          source.uri,
          rangeFromOffsets(source.text, link.from, link.to)
        );
      }
    }

    if (params?.context?.includeDeclaration) {
      const target = this.documents.get(targetUri);
      if (target) {
        pushUniqueLocation(
          locations,
          seen,
          targetUri,
          subpathRange(target.text, requestedKind, requestedSubpath)
        );
      }
    }
    return locations;
  }

  private hover(params: any): unknown {
    const document = this.documentForParams(params);
    const position = positionFromParams(params);
    if (!document || !position) return null;
    const offset = offsetAt(document.text, position);
    const tag = tagAt(document.text, offset);
    if (tag) {
      const notes = this.vault.getTagged(tag.tag);
      return {
        contents: {
          kind: "markdown",
          value: `**#${escapeMarkdown(tag.tag)}**\n\nUsed in ${notes.length} note${
            notes.length === 1 ? "" : "s"
          }.`,
        },
        range: rangeFromOffsets(document.text, tag.from, tag.to),
      };
    }

    const link = linkAt(document.text, offset);
    if (!link) return null;
    const destination = parseLinkDestination(link.raw);
    const targetUri = destination.target
      ? this.vault.resolveLink(destination.target)
      : document.uri;
    if (!targetUri) {
      return {
        contents: {
          kind: "markdown",
          value: `**Unresolved wikilink**\n\n\`${escapeCode(destination.target)}\``,
        },
        range: rangeFromOffsets(document.text, link.from, link.to),
      };
    }

    const note = this.vault.getNote(targetUri);
    const backlinks = this.vault.getBacklinks(targetUri).length;
    const subpath = destination.subpath
      ? `\n\n${destination.kind === "block" ? "Block" : "Heading"}: \`${escapeCode(
          destination.subpath
        )}\``
      : "";
    return {
      contents: {
        kind: "markdown",
        value: `**${escapeMarkdown(note?.name ?? destination.target)}**\n\n\`${escapeCode(
          this.displayPath(targetUri)
        )}\`${subpath}\n\n${backlinks} backlink${backlinks === 1 ? "" : "s"}.`,
      },
      range: rangeFromOffsets(document.text, link.from, link.to),
    };
  }

  private documentSymbols(params: any): unknown {
    const document = this.documentForParams(params);
    return document ? buildDocumentSymbols(document.text) : [];
  }

  private documentLinks(params: any): unknown {
    const document = this.documentForParams(params);
    if (!document) return [];
    const links: any[] = [];
    for (const link of parseNote(document.text).links) {
      const destination = parseLinkDestination(link.raw);
      const target = destination.target
        ? this.vault.resolveLink(destination.target)
        : document.uri;
      if (!target) continue;
      links.push({
        range: rangeFromOffsets(document.text, link.from, link.to),
        target,
        tooltip: `Open ${this.displayPath(target)}`,
      });
    }
    return links;
  }

  private workspaceSymbols(params: any): unknown {
    const query = typeof params?.query === "string" ? params.query.trim() : "";
    const symbols: Array<{ score: number; value: any }> = [];

    for (const note of this.vault.getAllNotes()) {
      const document = this.documents.get(note.path);
      if (!document) continue;
      const relative = this.displayPath(note.path);
      const noteScore = Math.min(matchScore(note.name, query), matchScore(relative, query));
      if (noteScore < 10) {
        symbols.push({
          score: noteScore,
          value: {
            name: note.name,
            kind: SYMBOL_KIND.file,
            location: { uri: note.path, range: zeroRange() },
            containerName: relative,
          },
        });
      }
      for (const heading of parseDocumentStructure(document.text).headings) {
        const score = matchScore(heading.text, query);
        if (score >= 10) continue;
        symbols.push({
          score,
          value: {
            name: heading.text,
            kind: SYMBOL_KIND.string,
            location: { uri: note.path, range: rangeForLine(document.text, heading.line) },
            containerName: relative,
          },
        });
      }
    }

    return symbols
      .sort((a, b) => a.score - b.score || a.value.name.localeCompare(b.value.name))
      .slice(0, MAX_WORKSPACE_SYMBOLS)
      .map((entry) => entry.value);
  }

  private tagReferences(tag: string): unknown[] {
    const normalized = tag.toLocaleLowerCase();
    const locations: unknown[] = [];
    for (const document of this.documents.values()) {
      for (const ref of parseNote(document.text).tags) {
        if (ref.tag.toLocaleLowerCase() !== normalized) continue;
        locations.push({
          uri: document.uri,
          range: rangeFromOffsets(document.text, ref.from, ref.to),
        });
      }
    }
    return locations;
  }

  private documentForParams(params: any): DocumentState | undefined {
    const uri = params?.textDocument?.uri;
    return typeof uri === "string" ? this.documents.get(normalizeUri(uri)) : undefined;
  }

  private displayPath(uri: string): string {
    const filePath = filePathFromUri(uri);
    if (!filePath) return decodeUriTail(uri);
    for (const root of this.workspaceRoots) {
      const rootPath = filePathFromUri(root);
      if (!rootPath) continue;
      const relative = path.relative(rootPath, filePath);
      if (relative && !relative.startsWith(`..${path.sep}`) && relative !== "..") {
        return relative.split(path.sep).join("/");
      }
      if (relative === "") return path.basename(filePath);
    }
    return path.basename(filePath);
  }

  private log(type: 1 | 2 | 3 | 4, message: string): void {
    this.peer.notify("window/logMessage", { type, message: `Flintmark: ${message}` });
  }
}

export function completionContextAt(
  text: string,
  offset: number
): FlintmarkCompletionContext | null {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf("\n", safeOffset - 1) + 1;
  const before = text.slice(lineStart, safeOffset);
  const open = before.lastIndexOf("[[");
  const closed = before.lastIndexOf("]]", safeOffset);

  if (open > closed) {
    const inner = before.slice(open + 2);
    if (inner.includes("|")) return null;
    const hash = inner.indexOf("#");
    const caret = inner.indexOf("^");
    let marker = -1;
    let kind: "heading" | "block" = "heading";
    if (hash >= 0 && (caret < 0 || hash < caret)) {
      marker = hash;
      if (inner[hash + 1] === "^") kind = "block";
    } else if (caret >= 0) {
      marker = caret;
      kind = "block";
    }

    if (marker >= 0) {
      const blockPrefix = kind === "block" && inner[marker] === "#" ? 2 : 1;
      const query = inner.slice(marker + blockPrefix);
      return {
        kind,
        target: inner.slice(0, marker).trim(),
        query,
        from: safeOffset - query.length,
        to: safeOffset,
      };
    }

    return {
      kind: "note",
      query: inner,
      from: lineStart + open + 2,
      to: safeOffset,
    };
  }

  const tagMatch = /(^|[^A-Za-z0-9])#([A-Za-z0-9_/-]*)$/.exec(before);
  if (!tagMatch) return null;
  const query = tagMatch[2];
  return {
    kind: "tag",
    query,
    from: safeOffset - query.length,
    to: safeOffset,
  };
}

export function applyContentChanges(text: string, changes: readonly any[]): string {
  let next = text;
  for (const change of changes) {
    if (typeof change?.text !== "string") continue;
    if (!change.range) {
      next = change.text;
      continue;
    }
    const from = offsetAt(next, change.range.start);
    const to = offsetAt(next, change.range.end);
    next = next.slice(0, from) + change.text + next.slice(to);
  }
  return next;
}

export function buildDocumentSymbols(text: string): unknown[] {
  const structure = parseDocumentStructure(text);
  const headingSymbols = structure.headings.map((heading, index) => {
    let sectionEnd = positionAt(text, text.length);
    for (let next = index + 1; next < structure.headings.length; next++) {
      if (structure.headings[next].level <= heading.level) {
        sectionEnd = { line: structure.headings[next].line, character: 0 };
        break;
      }
    }
    return {
      level: heading.level,
      line: heading.line,
      symbol: {
        name: heading.text,
        detail: `H${heading.level}`,
        kind: SYMBOL_KIND.string,
        range: {
          start: { line: heading.line, character: 0 },
          end: sectionEnd,
        },
        selectionRange: rangeForLine(text, heading.line),
        children: [] as any[],
      },
    };
  });

  const roots: any[] = [];
  const stack: typeof headingSymbols = [];
  const events = [
    ...headingSymbols.map((heading) => ({ type: "heading" as const, line: heading.line, heading })),
    ...structure.todos.map((todo) => ({ type: "todo" as const, line: todo.line, todo })),
  ].sort((a, b) => a.line - b.line || (a.type === "heading" ? -1 : 1));

  for (const event of events) {
    if (event.type === "heading") {
      const heading = event.heading;
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.symbol.children.push(heading.symbol);
      else roots.push(heading.symbol);
      stack.push(heading);
      continue;
    }

    const todo = event.todo;
    const label = todo.text || "(empty task)";
    const symbol = {
      name: `[${todo.status}] ${label}`,
      detail: "Task",
      kind: SYMBOL_KIND.boolean,
      range: rangeForLine(text, todo.line),
      selectionRange: {
        start: { line: todo.line, character: todo.character },
        end: { line: todo.line, character: todo.character + 3 },
      },
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.symbol.children.push(symbol);
    else roots.push(symbol);
  }

  return roots;
}

export function offsetAt(text: string, position: Position): number {
  const targetLine = Math.max(0, position.line);
  let line = 0;
  let offset = 0;
  while (line < targetLine && offset < text.length) {
    const newline = text.indexOf("\n", offset);
    if (newline < 0) return text.length;
    offset = newline + 1;
    line++;
  }
  if (line < targetLine) return text.length;
  const lineEnd = text.indexOf("\n", offset);
  const max = lineEnd < 0 ? text.length : lineEnd;
  return Math.min(offset + Math.max(0, position.character), max);
}

export function positionAt(text: string, offset: number): Position {
  const target = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < target; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }
  return { line, character: target - lineStart };
}

function positionFromParams(params: any): Position | null {
  const position = params?.position;
  return typeof position?.line === "number" && typeof position?.character === "number"
    ? position
    : null;
}

function rangeFromOffsets(text: string, from: number, to: number): Range {
  return { start: positionAt(text, from), end: positionAt(text, to) };
}

function rangeForLine(text: string, line: number): Range {
  const start = offsetAt(text, { line, character: 0 });
  let end = text.indexOf("\n", start);
  if (end < 0) end = text.length;
  if (end > start && text.charCodeAt(end - 1) === 13) end--;
  return rangeFromOffsets(text, start, end);
}

function zeroRange(): Range {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}

function linkAt(text: string, offset: number): WikiLinkRef | undefined {
  return parseNote(text).links.find((link) => offset >= link.from && offset <= link.to);
}

function tagAt(
  text: string,
  offset: number
): { tag: string; from: number; to: number } | undefined {
  return parseNote(text).tags.find((tag) => offset >= tag.from && offset <= tag.to);
}

function parseLinkDestination(raw: string): LinkDestination {
  const inner = raw.slice(2, -2).split("|", 1)[0];
  const hash = inner.indexOf("#");
  const caret = inner.indexOf("^");
  let marker = -1;
  let kind: LinkDestination["kind"] = null;
  if (hash >= 0 && (caret < 0 || hash < caret)) {
    marker = hash;
    kind = inner[hash + 1] === "^" ? "block" : "heading";
  } else if (caret >= 0) {
    marker = caret;
    kind = "block";
  }
  if (marker < 0) return { target: inner.trim(), kind: null, subpath: null };
  const extra = kind === "block" && inner[marker] === "#" ? 2 : 1;
  return {
    target: inner.slice(0, marker).trim(),
    kind,
    subpath: inner.slice(marker + extra).trim(),
  };
}

function subpathRange(
  text: string,
  kind: LinkDestination["kind"],
  subpath: string | null
): Range {
  if (!kind || !subpath) return zeroRange();
  if (kind === "heading") {
    const wanted = normalizeReference(subpath);
    const heading = parseDocumentStructure(text).headings.find(
      (candidate) => normalizeReference(candidate.text) === wanted
    );
    return heading ? rangeForLine(text, heading.line) : zeroRange();
  }
  const wanted = subpath.toLocaleLowerCase();
  const anchor = parseBlockAnchors(text).find(
    (candidate) => candidate.name.toLocaleLowerCase() === wanted
  );
  return anchor ? rangeForLine(text, anchor.line) : zeroRange();
}

function parseBlockAnchors(text: string): Array<{ name: string; line: number }> {
  const anchors: Array<{ name: string; line: number }> = [];
  const lines = text.split(/\r?\n/);
  let fence: { character: string; length: number } | null = null;
  for (let line = 0; line < lines.length; line++) {
    const source = lines[line];
    if (fence) {
      const close = new RegExp(`^[ \\t]*\\${fence.character}{${fence.length},}[ \\t]*$`);
      if (close.test(source)) fence = null;
      continue;
    }
    const open = /^[ \t]*(`{3,}|~{3,})/.exec(source);
    if (open) {
      fence = { character: open[1][0], length: open[1].length };
      continue;
    }
    const match = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/.exec(source);
    if (match) anchors.push({ name: match[1], line });
  }
  return anchors;
}

function completeWikiText(value: string, text: string, offset: number): string {
  return value + (text.slice(offset, offset + 2) === "]]" ? "" : "]]");
}

function matchScore(value: string, query: string): number {
  const candidate = value.toLocaleLowerCase();
  const wanted = query.trim().toLocaleLowerCase();
  if (!wanted) return 0;
  if (candidate === wanted) return 0;
  if (candidate.startsWith(wanted)) return 1;
  const segment = candidate
    .split(/[\\/\s._-]+/)
    .some((part) => part.startsWith(wanted));
  if (segment) return 2;
  if (candidate.includes(wanted)) return 3;
  return 10;
}

function compareCandidates(
  a: { score: number; target?: string; tag?: string; value?: string },
  b: { score: number; target?: string; tag?: string; value?: string }
): number {
  const aValue = a.target ?? a.tag ?? a.value ?? "";
  const bValue = b.target ?? b.tag ?? b.value ?? "";
  return a.score - b.score || aValue.length - bValue.length || aValue.localeCompare(bValue);
}

function sortText(score: number, index: number): string {
  return `${score}-${index.toString().padStart(4, "0")}`;
}

function normalizeReference(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-");
}

function uniqueCaseInsensitive(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function pushUniqueLocation(
  locations: any[],
  seen: Set<string>,
  uri: string,
  range: Range
): void {
  const key = `${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
  if (seen.has(key)) return;
  seen.add(key);
  locations.push({ uri, range });
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, "");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function isMarkdownPath(value: string): boolean {
  return MARKDOWN_SUFFIXES.has(path.extname(value).toLocaleLowerCase());
}

function isFileUri(uri: string): boolean {
  try {
    return new URL(uri).protocol === "file:";
  } catch {
    return false;
  }
}

function normalizeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "file:" ? pathToFileURL(fileURLToPath(parsed)).href : parsed.href;
  } catch {
    return uri;
  }
}

function filePathFromUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : null;
  } catch {
    return null;
  }
}

async function readMarkdownUri(uri: string): Promise<DocumentState | null> {
  const filePath = filePathFromUri(uri);
  return filePath ? readMarkdownDocument(filePath) : null;
}

async function readMarkdownDocument(filePath: string): Promise<DocumentState | null> {
  try {
    const metadata = await fs.stat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_NOTE_BYTES) return null;
    return {
      uri: pathToFileURL(filePath).href,
      text: await fs.readFile(filePath, "utf8"),
      open: false,
    };
  } catch {
    return null;
  }
}

function decodeUriTail(uri: string): string {
  const tail = uri.split("/").pop() ?? uri;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, "\\$&");
}

function escapeCode(value: string): string {
  return value.replace(/`/g, "\\`");
}
