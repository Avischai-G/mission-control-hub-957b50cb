export type LocalFileInfo = {
  appRoot: string;
  defaultPath: string;
  clawDataRoot: string;
  computerRootPath: string;
  platform: string;
};

export type LocalFileEntry = {
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

export type LocalFilePreview = LocalFileEntry & {
  content: string;
};

const API_PREFIX = "/__localfs";

export async function getLocalFileInfo() {
  return await getJson<LocalFileInfo>(`${API_PREFIX}/info`);
}

export async function listLocalFiles(path: string) {
  return await getJson<{ entries: LocalFileEntry[] }>(`${API_PREFIX}/list?path=${encodeURIComponent(path)}`);
}

export async function getLocalFileMetadata(path: string) {
  return await getJson<{ metadata: LocalFileEntry }>(`${API_PREFIX}/metadata?path=${encodeURIComponent(path)}`);
}

export async function readLocalFile(path: string) {
  return await getJson<{ file: LocalFilePreview }>(`${API_PREFIX}/read?path=${encodeURIComponent(path)}`);
}

export async function writeLocalFile(
  path: string,
  content: string,
  options?: { allowMirrorWrite?: boolean },
) {
  const response = await fetch(`${API_PREFIX}/write`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, content, allowMirrorWrite: options?.allowMirrorWrite === true }),
  });

  return await parseJson<{ success: boolean; file: LocalFilePreview }>(response);
}

async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  return await parseJson<T>(response);
}

async function parseJson<T>(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Request failed.";
    throw new Error(message);
  }
  return payload as T;
}
