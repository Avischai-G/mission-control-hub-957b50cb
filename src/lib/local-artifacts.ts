import { getAccessToken } from "@/lib/auth-session";

export type LocalArtifactType = "website" | "presentation";

export type LocalArtifact = {
  id: string;
  type: LocalArtifactType;
  label: string;
  html: string;
  createdAt: string;
  url?: string;
  filePath?: string;
  fileName?: string;
};

const STORAGE_PREFIX = "amc.local-artifact.";
const objectUrlCache = new Map<string, string>();

function getStorageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

export function saveLocalArtifact(artifact: LocalArtifact) {
  localStorage.setItem(getStorageKey(artifact.id), JSON.stringify(artifact));
  return artifact;
}

export function getLocalArtifact(id: string): LocalArtifact | null {
  const raw = localStorage.getItem(getStorageKey(id));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalArtifact;
    if (!parsed?.id || !parsed?.type || !parsed?.label) return null;
    if (!parsed?.html && !parsed?.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getArtifactUrl(artifact: LocalArtifact): string {
  const cached = objectUrlCache.get(artifact.id);
  if (cached) return cached;

  const url = URL.createObjectURL(new Blob([artifact.html], { type: "text/html" }));
  objectUrlCache.set(artifact.id, url);
  return url;
}

function writeArtifactStatusDocument(targetWindow: Window, title: string, message: string) {
  targetWindow.document.open();
  targetWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: system-ui, sans-serif;
            background: #0b1020;
            color: #f7f9fc;
          }
          .card {
            max-width: 32rem;
            padding: 2rem;
            border-radius: 1rem;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          }
          p {
            margin: 0.5rem 0 0;
            color: rgba(247, 249, 252, 0.78);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `);
  targetWindow.document.close();
}

function extractErrorMessage(payload: string, status: number): string {
  try {
    const parsed = JSON.parse(payload) as { error?: string };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // Fall back to the raw response body.
  }

  const fallback = payload.trim();
  return fallback || `Request failed with HTTP ${status}.`;
}

export async function openSavedWebsite(
  url: string,
  targetWindow?: Window | null,
): Promise<Window | null> {
  const popup = targetWindow && !targetWindow.closed ? targetWindow : window.open("", "_blank");
  if (!popup) return null;

  writeArtifactStatusDocument(popup, "Opening website", "Loading the saved website...");

  try {
    const accessToken = await getAccessToken();
    const response = await fetch(url, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const html = await response.text();

    if (!response.ok) {
      throw new Error(extractErrorMessage(html, response.status));
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    return popup;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the saved website.";
    writeArtifactStatusDocument(popup, "Unable to open website", message);
    throw error;
  }
}

export function openLocalArtifact(
  artifactId: string,
  targetWindow?: Window | null
): Window | null {
  const artifact = getLocalArtifact(artifactId);
  if (!artifact) return null;

  if (artifact.url) {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = artifact.url;
      targetWindow.focus();
      return targetWindow;
    }

    return window.open(artifact.url, "_blank");
  }

  const url = getArtifactUrl(artifact);
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
    targetWindow.focus();
    return targetWindow;
  }

  return window.open(url, "_blank");
}

function fallbackCopyText(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.top = "0";
  textarea.style.left = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyLocalArtifact(artifactId: string): Promise<boolean> {
  const artifact = getLocalArtifact(artifactId);
  if (!artifact?.html) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(artifact.html);
      return true;
    } catch {
      return fallbackCopyText(artifact.html);
    }
  }

  return fallbackCopyText(artifact.html);
}
