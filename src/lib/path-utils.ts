export function normalizeFsPath(value: string) {
  if (!value) return "";
  return value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

export function normalizeFsPathForCompare(value: string) {
  return normalizeFsPath(value).toLowerCase();
}

export function joinFsPath(root: string, ...segments: string[]) {
  if (!root) return segments.join("/");
  const separator = root.includes("\\") ? "\\" : "/";
  const trimmedRoot = root.replace(/[\\/]+$/, "");
  const cleanedSegments = segments.map((segment) => segment.replace(/^[\\/]+|[\\/]+$/g, ""));
  return [trimmedRoot, ...cleanedSegments].join(separator);
}

export function parentFsPath(currentPath: string, computerRootPath: string) {
  if (!currentPath || currentPath === computerRootPath) return computerRootPath;

  const normalized = currentPath.replace(/[\\/]+$/, "");
  const windowsRootMatch = normalized.match(/^[A-Za-z]:$/);
  if (windowsRootMatch) return computerRootPath;
  if (normalized === "/") return computerRootPath;

  const separator = currentPath.includes("\\") ? "\\" : "/";
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const isUnixAbsolute = normalized.startsWith("/");
  const isWindowsAbsolute = /^[A-Za-z]:/.test(normalized);

  if (parts.length <= 1) {
    if (isWindowsAbsolute) return `${parts[0]}${separator}`;
    return "/";
  }

  parts.pop();
  const nextPath = parts.join(separator);

  if (isWindowsAbsolute) {
    return nextPath.includes(":") ? nextPath : `${parts[0]}${separator}`;
  }

  return isUnixAbsolute ? `/${nextPath}` : nextPath;
}

export function buildAbsolutePathCrumbs(currentPath: string) {
  if (!currentPath || currentPath === "__computer__") return [];

  const separator = currentPath.includes("\\") ? "\\" : "/";
  const normalized = currentPath.replace(/[\\/]+$/, "");
  const isUnixAbsolute = normalized.startsWith("/");
  const windowsDriveMatch = normalized.match(/^[A-Za-z]:/);
  const trimmed = normalized
    .replace(/^[A-Za-z]:[\\/]?/, "")
    .replace(/^\/+/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];

  if (windowsDriveMatch) {
    const drive = windowsDriveMatch[0];
    crumbs.push({ label: drive, path: `${drive}${separator}` });
    let running = `${drive}${separator}`;
    for (const part of parts) {
      running = `${running.replace(/[\\/]+$/, "")}${separator}${part}`;
      crumbs.push({ label: part, path: running });
    }
    return crumbs;
  }

  if (isUnixAbsolute) {
    crumbs.push({ label: "/", path: "/" });
    let running = "";
    for (const part of parts) {
      running = `${running}/${part}`;
      crumbs.push({ label: part, path: running || "/" });
    }
    return crumbs;
  }

  let running = "";
  for (const part of parts) {
    running = running ? `${running}${separator}${part}` : part;
    crumbs.push({ label: part, path: running });
  }
  return crumbs;
}
