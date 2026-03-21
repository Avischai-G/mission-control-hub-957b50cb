import { normalizeFsPathForCompare } from "@/lib/path-utils";

export const PINNED_FOLDERS_STORAGE_KEY = "files-pinned-folders-v2";
export const FILES_QUICK_ACCESS_UPDATED_EVENT = "files-quick-access-updated";

export function readPinnedFolders() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PINNED_FOLDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function writePinnedFolders(nextFolders: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PINNED_FOLDERS_STORAGE_KEY, JSON.stringify(nextFolders));
  window.dispatchEvent(new CustomEvent(FILES_QUICK_ACCESS_UPDATED_EVENT));
}

export function getNextPinnedFolders(currentFolders: string[], folderPath: string) {
  const normalizedTarget = normalizeFsPathForCompare(folderPath);
  const exists = currentFolders.some((path) => normalizeFsPathForCompare(path) === normalizedTarget);

  if (exists) {
    return currentFolders.filter((path) => normalizeFsPathForCompare(path) !== normalizedTarget);
  }

  return [...currentFolders, folderPath];
}

