import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const FILE_API_PREFIX = "/__localfs";
const COMPUTER_ROOT_TOKEN = "__computer__";
const MAX_PREVIEW_BYTES = 200_000;

const WINDOWS_HIDDEN_DIRECTORIES = new Set([
  "$Recycle.Bin",
  "AppData",
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "Windows",
]);

const UNIX_PROTECTED_PREFIXES = [
  "/System",
  "/Library",
  "/private",
  "/tmp",
  "/var",
  "/dev",
  "/proc",
];

type FileEntry = {
  name: string;
  path: string;
  displayPath: string;
  kind: "file" | "directory";
  size: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  isReadable: boolean;
  isEditable: boolean;
  isProtected: boolean;
};

export function localFileServicePlugin(appRoot: string): Plugin {
  const resolvedAppRoot = path.resolve(appRoot);
  const clawDataRoot = resolveClawDataRoot();

  return {
    name: "local-file-service",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next, { appRoot: resolvedAppRoot, clawDataRoot });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next, { appRoot: resolvedAppRoot, clawDataRoot });
      });
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  context: { appRoot: string; clawDataRoot: string },
) {
  if (!req.url?.startsWith(FILE_API_PREFIX)) {
    next();
    return;
  }

  try {
    await ensureClawDataScaffold(context.clawDataRoot);
    const requestUrl = new URL(req.url, "http://127.0.0.1:8080");

    if (req.method === "GET" && requestUrl.pathname === `${FILE_API_PREFIX}/info`) {
      sendJson(res, {
        appRoot: context.appRoot,
        defaultPath: context.appRoot,
        clawDataRoot: context.clawDataRoot,
        computerRootPath: COMPUTER_ROOT_TOKEN,
        platform: process.platform,
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === `${FILE_API_PREFIX}/list`) {
      const requestedPath = requestUrl.searchParams.get("path") || context.appRoot;
      const entries = await listEntries(requestedPath, context);
      sendJson(res, { entries });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === `${FILE_API_PREFIX}/metadata`) {
      const requestedPath = requestUrl.searchParams.get("path");
      if (!requestedPath) {
        sendJson(res, { error: "path is required" }, 400);
        return;
      }

      const metadata = await getMetadata(requestedPath, context);
      sendJson(res, { metadata });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === `${FILE_API_PREFIX}/read`) {
      const requestedPath = requestUrl.searchParams.get("path");
      if (!requestedPath) {
        sendJson(res, { error: "path is required" }, 400);
        return;
      }

      const file = await readFilePreview(requestedPath, context);
      sendJson(res, { file });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === `${FILE_API_PREFIX}/write`) {
      const body = await readJsonBody(req);
      const requestedPath = typeof body.path === "string" ? body.path : "";
      const content = typeof body.content === "string" ? body.content : "";
      const allowMirrorWrite = body.allowMirrorWrite === true;

      if (!requestedPath) {
        sendJson(res, { error: "path is required" }, 400);
        return;
      }

      const file = await writeTextFile(requestedPath, content, context, { allowMirrorWrite });
      sendJson(res, { success: true, file });
      return;
    }

    sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, { error: message }, 500);
  }
}

async function ensureClawDataScaffold(clawDataRoot: string) {
  await Promise.all([
    fsp.mkdir(clawDataRoot, { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "agents"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "knowledge"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "knowledge", "shared"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "knowledge", "agents"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "runs"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "learning"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "learning", "reports"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "learning", "state"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "vault"), { recursive: true }),
    fsp.mkdir(path.join(clawDataRoot, "vault", "settings"), { recursive: true }),
  ]);

  await migrateLegacyAgentPromptDirectories(clawDataRoot);
}

async function migrateLegacyAgentPromptDirectories(clawDataRoot: string) {
  const agentsRoot = path.join(clawDataRoot, "agents");
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(agentsRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const legacyDir = path.join(agentsRoot, entry.name);
    const legacyPromptPath = path.join(legacyDir, "prompt.md");
    const flatPromptPath = path.join(agentsRoot, `${entry.name}.md`);

    try {
      const stat = await fsp.stat(legacyPromptPath).catch(() => null);
      if (!stat?.isFile()) continue;

      if (!(await fsp.stat(flatPromptPath).catch(() => null))) {
        const content = await fsp.readFile(legacyPromptPath, "utf8");
        await fsp.writeFile(flatPromptPath, content, "utf8");
      }

      const childEntries = await fsp.readdir(legacyDir);
      if (childEntries.length === 1 && childEntries[0] === "prompt.md") {
        await fsp.rm(legacyDir, { recursive: true, force: true });
      }
    } catch {
      continue;
    }
  }
}

async function listEntries(requestedPath: string, context: { appRoot: string; clawDataRoot: string }) {
  if (requestedPath === COMPUTER_ROOT_TOKEN) {
    if (process.platform === "win32") {
      const drives = await listWindowsDrives();
      return drives
        .map((drive) => tryBuildEntry(drive, context))
        .filter((entry): entry is FileEntry => Boolean(entry));
    }

    return (await fsp.readdir("/", { withFileTypes: true }))
      .filter((entry) => shouldIncludeEntry("/", entry.name, entry.isDirectory()))
      .map((entry) => tryBuildEntry(path.join("/", entry.name), context))
      .filter((entry): entry is FileEntry => Boolean(entry))
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
  }

  const targetPath = resolveInputPath(requestedPath, context.appRoot);
  const directoryEntries = await fsp.readdir(targetPath, { withFileTypes: true });

  return directoryEntries
    .filter((entry) => shouldIncludeEntry(targetPath, entry.name, entry.isDirectory()))
    .map((entry) => tryBuildEntry(path.join(targetPath, entry.name), context))
    .filter((entry): entry is FileEntry => Boolean(entry))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

async function getMetadata(requestedPath: string, context: { appRoot: string; clawDataRoot: string }) {
  if (requestedPath === COMPUTER_ROOT_TOKEN) {
    return {
      name: process.platform === "win32" ? "Computer" : "/",
      path: requestedPath,
      displayPath: process.platform === "win32" ? "Computer" : "/",
      kind: "directory" as const,
      size: null,
      createdAt: null,
      modifiedAt: null,
      isReadable: true,
      isEditable: false,
      isProtected: true,
    };
  }

  return buildEntry(resolveInputPath(requestedPath, context.appRoot), context);
}

async function readFilePreview(requestedPath: string, context: { appRoot: string; clawDataRoot: string }) {
  const absolutePath = resolveInputPath(requestedPath, context.appRoot);
  const stat = await fsp.stat(absolutePath);

  if (!stat.isFile()) {
    throw new Error(`"${requestedPath}" is not a file.`);
  }

  const buffer = await fsp.readFile(absolutePath);
  const binary = isBinaryBuffer(buffer);
  const rawContent = binary ? "[Binary or unsupported file preview]" : buffer.toString("utf8");
  const content = rawContent.length > MAX_PREVIEW_BYTES
    ? `${rawContent.slice(0, MAX_PREVIEW_BYTES)}\n\n[Preview truncated]`
    : rawContent;
  const metadata = buildEntry(absolutePath, context);

  return {
    ...metadata,
    content,
  };
}

async function writeTextFile(
  requestedPath: string,
  content: string,
  context: { appRoot: string; clawDataRoot: string },
  options?: { allowMirrorWrite?: boolean },
) {
  const absolutePath = resolveInputPath(requestedPath, context.appRoot);
  const canWriteDirectly = isEditablePath(absolutePath, context);
  const canWriteMirror = options?.allowMirrorWrite === true && isMirrorWritablePath(absolutePath, context);

  if (!canWriteDirectly && !canWriteMirror) {
    throw new Error("This file is read-only.");
  }

  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, content, "utf8");
  return await readFilePreview(absolutePath, context);
}

function buildEntry(absolutePath: string, context: { appRoot: string; clawDataRoot: string }): FileEntry {
  const stat = fs.statSync(absolutePath);
  const protectedPath = isProtectedPath(absolutePath, context);

  return {
    name: path.basename(absolutePath) || absolutePath,
    path: absolutePath,
    displayPath: absolutePath,
    kind: stat.isDirectory() ? "directory" : "file",
    size: stat.isFile() ? stat.size : null,
    createdAt: stat.birthtime?.toISOString() || null,
    modifiedAt: stat.mtime?.toISOString() || null,
    isReadable: true,
    isEditable: stat.isFile() && isEditablePath(absolutePath, context),
    isProtected: protectedPath,
  };
}

function tryBuildEntry(absolutePath: string, context: { appRoot: string; clawDataRoot: string }) {
  try {
    return buildEntry(absolutePath, context);
  } catch {
    return null;
  }
}

function resolveInputPath(requestedPath: string, appRoot: string) {
  if (!requestedPath || requestedPath === COMPUTER_ROOT_TOKEN) {
    return appRoot;
  }

  return path.isAbsolute(requestedPath) ? path.resolve(requestedPath) : path.resolve(appRoot, requestedPath);
}

function resolveClawDataRoot() {
  if (process.env.CLAW_DATA_ROOT) return path.resolve(process.env.CLAW_DATA_ROOT);
  if (process.platform === "win32") return "D:\\ClawData";
  return path.resolve(os.homedir(), ".codex", "tmp", "ai-mission-control-claw-data");
}

async function listWindowsDrives() {
  const drives: string[] = [];
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    const candidate = `${letter}:\\`;
    try {
      await fsp.access(candidate);
      drives.push(candidate);
    } catch {
      continue;
    }
  }
  return drives;
}

function isEditablePath(absolutePath: string, context: { appRoot: string; clawDataRoot: string }) {
  const agentRoot = path.join(context.clawDataRoot, "agents") + path.sep;
  const knowledgeRoot = path.join(context.clawDataRoot, "knowledge") + path.sep;
  const normalizedPath = normalizeCase(path.resolve(absolutePath));
  const normalizedAgentRoot = normalizeCase(path.resolve(agentRoot));
  const normalizedKnowledgeRoot = normalizeCase(path.resolve(knowledgeRoot));

  if (normalizedPath.startsWith(normalizedAgentRoot)) {
    const relativePath = path.relative(agentRoot, absolutePath);
    if (!relativePath || relativePath.startsWith("..")) return false;
    if (relativePath.includes(path.sep)) return false;
    return relativePath.toLowerCase().endsWith(".md");
  }

  if (normalizedPath.startsWith(normalizedKnowledgeRoot)) {
    const relativePath = path.relative(knowledgeRoot, absolutePath);
    if (!relativePath || relativePath.startsWith("..")) return false;
    return /\.(md|mdx|txt)$/i.test(relativePath);
  }

  return false;
}

function isMirrorWritablePath(absolutePath: string, context: { appRoot: string; clawDataRoot: string }) {
  const normalizedPath = normalizeCase(path.resolve(absolutePath));
  const allowedRoots = [
    path.join(context.clawDataRoot, "agents"),
    path.join(context.clawDataRoot, "knowledge"),
    path.join(context.clawDataRoot, "runs"),
    path.join(context.clawDataRoot, "learning", "reports"),
  ].map((root) => normalizeCase(path.resolve(root)));

  const withinAllowedRoot = allowedRoots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`));
  if (!withinAllowedRoot) return false;

  return /\.(md|mdx|txt|json)$/i.test(absolutePath);
}

function isProtectedPath(absolutePath: string, context: { appRoot: string; clawDataRoot: string }) {
  const normalized = normalizeCase(path.resolve(absolutePath));
  const normalizedAppRoot = normalizeCase(path.resolve(context.appRoot)) + path.sep;
  const normalizedClawRoot = normalizeCase(path.resolve(context.clawDataRoot)) + path.sep;

  if (normalized.startsWith(normalizedAppRoot) && !normalized.startsWith(normalizedClawRoot)) {
    return true;
  }

  if (process.platform === "win32") {
    return [
      "\\appdata\\",
      "\\program files\\",
      "\\program files (x86)\\",
      "\\programdata\\",
      "\\windows\\",
    ].some((token) => normalized.includes(token) || normalized.endsWith(token.slice(0, -1)));
  }

  return UNIX_PROTECTED_PREFIXES.some((prefix) => {
    const normalizedPrefix = normalizeCase(prefix);
    return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
  });
}

function normalizeCase(value: string) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function shouldIncludeEntry(parentPath: string, name: string, isDirectory: boolean) {
  if (process.platform === "win32") {
    if (WINDOWS_HIDDEN_DIRECTORIES.has(name)) return false;
    return true;
  }

  if (!isDirectory) return name !== ".DS_Store";
  return true;
}

function isBinaryBuffer(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return sample.includes(0);
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
