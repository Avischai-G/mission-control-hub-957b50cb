import { basename, dirname, fromFileUrl, join, normalize, relative, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type WorkspaceBranch = "computer" | "runs" | "learning" | "agents" | "knowledge" | "vault";

const WINDOWS_HIDDEN_FOLDERS = new Set([
  "$Recycle.Bin",
  "AppData",
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "Windows",
]);

const UNIX_HIDDEN_FOLDERS = new Set([
  ".Spotlight-V100",
  ".Trashes",
  "System",
  "private",
  "tmp",
  "var",
  "cores",
  "dev",
  "proc",
]);

const MAX_FILE_PREVIEW_CHARS = 200_000;

function defaultWorkspaceRoot() {
  if (Deno.build.os === "windows") {
    return "D:\\ClawData";
  }

  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (home) {
    return resolve(home, ".codex", "tmp", "ai-mission-control-claw-data");
  }

  return resolve("/tmp", "ai-mission-control-claw-data");
}

export function getWorkspaceRoot() {
  return Deno.env.get("CLAW_DATA_ROOT") || defaultWorkspaceRoot();
}

export function workspacePath(...segments: string[]) {
  return join(getWorkspaceRoot(), ...segments);
}

export function getComputerRootLabel() {
  return Deno.build.os === "windows" ? "Computer" : "Home";
}

function getUnixComputerRoot() {
  try {
    const usersStat = Deno.statSync("/Users");
    if (usersStat.isDirectory) return "/Users";
  } catch {
    // ignore
  }

  try {
    const homeStat = Deno.statSync("/home");
    if (homeStat.isDirectory) return "/home";
  } catch {
    // ignore
  }

  const pwd = (Deno.env.get("PWD") || "").replaceAll("\\", "/");
  const pwdMacHomeMatch = pwd.match(/^\/Users\/[^/]+/);
  if (pwdMacHomeMatch?.[0]) return pwdMacHomeMatch[0];

  const pwdLinuxHomeMatch = pwd.match(/^\/home\/[^/]+/);
  if (pwdLinuxHomeMatch?.[0]) return pwdLinuxHomeMatch[0];

  const cwd = Deno.cwd().replaceAll("\\", "/");
  const cwdMacHomeMatch = cwd.match(/^\/Users\/[^/]+/);
  if (cwdMacHomeMatch?.[0]) return cwdMacHomeMatch[0];

  const cwdLinuxHomeMatch = cwd.match(/^\/home\/[^/]+/);
  if (cwdLinuxHomeMatch?.[0]) return cwdLinuxHomeMatch[0];

  const modulePath = fromFileUrl(import.meta.url).replaceAll("\\", "/");
  const macHomeMatch = modulePath.match(/^\/Users\/[^/]+/);
  if (macHomeMatch?.[0]) return macHomeMatch[0];

  const linuxHomeMatch = modulePath.match(/^\/home\/[^/]+/);
  if (linuxHomeMatch?.[0]) return linuxHomeMatch[0];

  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (home) return resolve(home);
  return resolve("/tmp");
}

export async function ensureDir(path: string) {
  await Deno.mkdir(path, { recursive: true });
}

export async function ensureWorkspaceScaffold() {
  const root = getWorkspaceRoot();
  await Promise.all([
    ensureDir(root),
    ensureDir(workspacePath("agents")),
    ensureDir(workspacePath("knowledge", "shared")),
    ensureDir(workspacePath("knowledge", "agents")),
    ensureDir(workspacePath("runs")),
    ensureDir(workspacePath("learning", "state")),
    ensureDir(workspacePath("learning", "reports")),
    ensureDir(workspacePath("vault", "settings")),
  ]);
}

export async function pathExists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(path: string) {
  return await Deno.readTextFile(path);
}

export async function readTextFileIfExists(path: string, fallback = "") {
  if (!(await pathExists(path))) return fallback;
  return await Deno.readTextFile(path);
}

export async function writeTextFile(path: string, content: string) {
  await ensureDir(dirname(path));
  await Deno.writeTextFile(path, content);
}

export function getAgentPromptPath(agentId: string) {
  return workspacePath("agents", `${agentId}.md`);
}

export async function ensureAgentPromptFile(agentId: string, fallbackContent: string) {
  const path = getAgentPromptPath(agentId);
  if (!(await pathExists(path))) {
    await writeTextFile(path, fallbackContent || `# ${agentId}\n`);
  }
  return path;
}

export function tokenEstimateForText(content: string) {
  if (!content) return 0;
  return Math.max(0, Math.ceil(content.length / 4));
}

export function formatRunSummaryFilename({
  createdAt,
  agentId,
  taskDomain,
  channel,
  status,
}: {
  createdAt: string;
  agentId: string;
  taskDomain: string;
  channel: string;
  status: string;
}) {
  const safeTimestamp = createdAt.replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  return `${safeTimestamp}__${sanitizeFileStem(agentId)}__${sanitizeFileStem(taskDomain)}__${sanitizeFileStem(channel)}__${sanitizeFileStem(status)}.md`;
}

export async function writeRunSummaryFile({
  createdAt,
  agentId,
  taskDomain,
  channel,
  status,
  frontmatter,
  sections,
}: {
  createdAt: string;
  agentId: string;
  taskDomain: string;
  channel: string;
  status: string;
  frontmatter: Record<string, unknown>;
  sections: Array<{ heading: string; body: string }>;
}) {
  const date = new Date(createdAt);
  const dir = workspacePath(
    "runs",
    `${date.getUTCFullYear()}`,
    `${date.getUTCMonth() + 1}`.padStart(2, "0"),
    `${date.getUTCDate()}`.padStart(2, "0"),
  );
  await ensureDir(dir);

  const fileName = formatRunSummaryFilename({ createdAt, agentId, taskDomain, channel, status });
  const content = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${yamlScalar(value)}`),
    "---",
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body.trim(), ""]),
  ].join("\n");

  const fullPath = join(dir, fileName);
  await writeTextFile(fullPath, content.trimEnd() + "\n");
  return { path: fullPath, fileName, content };
}

function yamlScalar(value: unknown): string {
  if (value == null) return '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map((item) => yamlScalar(item)).join(", ")}]`;
  }
  return JSON.stringify(String(value));
}

function sanitizeFileStem(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

type DirectoryEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: string | null;
};

const BRANCH_ROOTS: Record<WorkspaceBranch, string[]> = {
  computer: [],
  runs: ["runs"],
  learning: ["learning", "reports"],
  agents: ["agents"],
  knowledge: ["knowledge"],
  vault: ["vault"],
};

function normalizeDisplayPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

async function discoverWindowsDriveRoots() {
  const roots: string[] = [];
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    const candidate = `${letter}:\\`;
    if (await pathExists(candidate)) {
      roots.push(candidate);
    }
  }
  return roots;
}

function shouldHideComputerEntry(fullPath: string, name: string) {
  if (Deno.build.os === "windows") {
    if (WINDOWS_HIDDEN_FOLDERS.has(name)) return true;
    const normalized = normalizeDisplayPath(fullPath).toLowerCase();
    if (normalized.includes("/appdata/")) return true;
    if (normalized.endsWith("/appdata")) return true;
    return false;
  }

  if (name.startsWith(".")) return true;
  return UNIX_HIDDEN_FOLDERS.has(name);
}

function serializeComputerPath(fullPath: string) {
  if (Deno.build.os === "windows") {
    return normalizeDisplayPath(fullPath);
  }

  return normalizeDisplayPath(relative(getUnixComputerRoot(), fullPath));
}

async function resolveComputerPath(relativePath = "") {
  const normalizedRelativePath = normalizeDisplayPath(relativePath);

  if (Deno.build.os === "windows") {
    if (!normalizedRelativePath) {
      return {
        virtualRoot: true as const,
        root: "computer",
        path: "computer",
      };
    }

    const driveMatch = normalizedRelativePath.match(/^([A-Za-z]:)(?:\/(.*))?$/);
    if (!driveMatch) {
      throw new Error(`Computer path "${relativePath}" is invalid.`);
    }

    const driveRoot = `${driveMatch[1]}\\`;
    const rest = driveMatch[2] ? driveMatch[2].replaceAll("/", "\\") : "";
    const candidate = rest ? resolve(driveRoot, rest) : resolve(driveRoot);
    const rel = relative(resolve(driveRoot), candidate);
    if (rel.startsWith("..") || normalize(rel).startsWith("..")) {
      throw new Error(`Computer path "${relativePath}" escapes the selected drive.`);
    }

    return {
      virtualRoot: false as const,
      root: resolve(driveRoot),
      path: candidate,
    };
  }

  const unixRoot = getUnixComputerRoot();
  const candidate = normalizedRelativePath ? resolve(unixRoot, normalizedRelativePath) : unixRoot;
  const rel = relative(unixRoot, candidate);
  if (rel.startsWith("..") || normalize(rel).startsWith("..")) {
    throw new Error(`Computer path "${relativePath}" escapes the filesystem root.`);
  }

  return {
    virtualRoot: false as const,
    root: unixRoot,
    path: candidate,
  };
}

export async function listComputerEntries(relativePath = ""): Promise<DirectoryEntry[]> {
  const resolvedComputerPath = await resolveComputerPath(relativePath);

  if (resolvedComputerPath.virtualRoot) {
    const drives = await discoverWindowsDriveRoots();
    return drives.map((driveRoot) => ({
      name: driveRoot.replace("\\", ""),
      path: serializeComputerPath(driveRoot),
      kind: "directory" as const,
      size: null,
      modifiedAt: null,
    }));
  }

  const { path } = resolvedComputerPath;
  if (!(await pathExists(path))) {
    return [];
  }

  const entries: DirectoryEntry[] = [];
  for await (const entry of Deno.readDir(path)) {
    const fullPath = join(path, entry.name);
    if (shouldHideComputerEntry(fullPath, entry.name)) continue;

    const stat = await Deno.stat(fullPath);
    entries.push({
      name: entry.name,
      path: serializeComputerPath(fullPath),
      kind: entry.isDirectory ? "directory" : "file",
      size: entry.isFile ? stat.size : null,
      modifiedAt: stat.mtime?.toISOString() || null,
    });
  }

  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export async function readComputerFile(relativePath: string) {
  const { path } = await resolveComputerPath(relativePath);
  const stat = await Deno.stat(path);
  if (!stat.isFile) {
    throw new Error(`"${relativePath}" is not a file.`);
  }

  let content = "";
  try {
    content = await Deno.readTextFile(path);
  } catch {
    content = "[Binary or unsupported file preview]";
  }

  if (content.length > MAX_FILE_PREVIEW_CHARS) {
    content = `${content.slice(0, MAX_FILE_PREVIEW_CHARS)}\n\n[Preview truncated]`;
  }

  return {
    name: basename(path),
    path: serializeComputerPath(path),
    content,
    modifiedAt: stat.mtime?.toISOString() || null,
    size: stat.size,
  };
}

export function resolveBranchPath(branch: WorkspaceBranch, relativePath = "") {
  if (branch === "computer") {
    throw new Error("Use resolveComputerPath for the computer branch.");
  }

  const branchRoot = workspacePath(...BRANCH_ROOTS[branch]);
  const normalizedBranchRoot = resolve(branchRoot);
  const candidate = resolve(branchRoot, relativePath || ".");
  const rel = relative(normalizedBranchRoot, candidate);

  if (rel.startsWith("..") || normalize(rel).startsWith("..")) {
    throw new Error(`Path "${relativePath}" escapes the ${branch} workspace.`);
  }

  return { branchRoot: normalizedBranchRoot, path: candidate };
}

export async function listBranchEntries(branch: WorkspaceBranch, relativePath = ""): Promise<DirectoryEntry[]> {
  if (branch === "computer") {
    return await listComputerEntries(relativePath);
  }

  const { branchRoot, path } = resolveBranchPath(branch, relativePath);
  await ensureDir(branchRoot);
  if (!(await pathExists(path))) {
    return [];
  }

  const entries: DirectoryEntry[] = [];
  for await (const entry of Deno.readDir(path)) {
    const fullPath = join(path, entry.name);
    const stat = await Deno.stat(fullPath);
    entries.push({
      name: entry.name,
      path: relative(branchRoot, fullPath).replaceAll("\\", "/"),
      kind: entry.isDirectory ? "directory" : "file",
      size: entry.isFile ? stat.size : null,
      modifiedAt: stat.mtime?.toISOString() || null,
    });
  }

  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export async function exportBranchFiles(
  branch: Exclude<WorkspaceBranch, "computer" | "vault">,
  relativePath = "",
) {
  const { branchRoot, path } = resolveBranchPath(branch, relativePath);
  await ensureDir(branchRoot);
  if (!(await pathExists(path))) {
    return [] as Array<{
      path: string;
      content: string;
      modifiedAt: string | null;
      size: number;
    }>;
  }

  const files: Array<{
    path: string;
    content: string;
    modifiedAt: string | null;
    size: number;
  }> = [];

  for await (const entry of walk(path, { includeDirs: false })) {
    const stat = await Deno.stat(entry.path);
    if (!stat.isFile) continue;

    let content = "";
    try {
      content = await Deno.readTextFile(entry.path);
    } catch {
      continue;
    }

    files.push({
      path: relative(branchRoot, entry.path).replaceAll("\\", "/"),
      content,
      modifiedAt: stat.mtime?.toISOString() || null,
      size: stat.size,
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function readBranchFile(branch: WorkspaceBranch, relativePath: string) {
  if (branch === "computer") {
    return await readComputerFile(relativePath);
  }

  const { path } = resolveBranchPath(branch, relativePath);
  const stat = await Deno.stat(path);
  if (!stat.isFile) {
    throw new Error(`"${relativePath}" is not a file.`);
  }
  return {
    name: basename(path),
    path: relative(getWorkspaceRoot(), path).replaceAll("\\", "/"),
    content: await Deno.readTextFile(path),
    modifiedAt: stat.mtime?.toISOString() || null,
    size: stat.size,
  };
}

export function encodeBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

export function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function encodeUtf8(value: string) {
  return textEncoder.encode(value);
}

export function decodeUtf8(value: BufferSource) {
  return textDecoder.decode(value);
}

function stripFrontmatter(content: string) {
  if (!content.startsWith("---\n")) return content;
  const closingMarker = content.indexOf("\n---\n", 4);
  if (closingMarker === -1) return content;
  return content.slice(closingMarker + 5);
}

function extractMarkdownSection(content: string, heading: string) {
  const withoutFrontmatter = stripFrontmatter(content);
  const marker = `## ${heading}`;
  const startIndex = withoutFrontmatter.indexOf(marker);
  if (startIndex === -1) return "";
  const afterHeading = withoutFrontmatter.slice(startIndex + marker.length).replace(/^\s+/, "");
  const nextHeadingIndex = afterHeading.search(/\n##\s+/);
  const sectionBody = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);
  return sectionBody.trim();
}

export async function listRecentRunSummaries(limit = 50) {
  const runsRoot = workspacePath("runs");
  await ensureDir(runsRoot);

  const summaries: Array<{
    fileName: string;
    path: string;
    modifiedAt: string | null;
    size: number;
    objective: string;
    result: string;
    blockers: string;
  }> = [];

  for await (const entry of walk(runsRoot, { includeDirs: false, exts: [".md"] })) {
    const stat = await Deno.stat(entry.path);
    const content = await readTextFileIfExists(entry.path, "");
    summaries.push({
      fileName: basename(entry.path),
      path: relative(getWorkspaceRoot(), entry.path).replaceAll("\\", "/"),
      modifiedAt: stat.mtime?.toISOString() || null,
      size: stat.size,
      objective: extractMarkdownSection(content, "Objective"),
      result: extractMarkdownSection(content, "Result"),
      blockers: extractMarkdownSection(content, "Blockers"),
    });
  }

  return summaries
    .sort((left, right) => new Date(right.modifiedAt || 0).getTime() - new Date(left.modifiedAt || 0).getTime())
    .slice(0, limit);
}
