const ENCRYPTED_PREFIX = "enc:v1";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function getCryptoKey(): Promise<CryptoKey> {
  const secret =
    Deno.env.get("CREDENTIAL_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secret) {
    throw new Error("Missing credential encryption secret.");
  }

  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string): Promise<string> {
  if (!secret) return secret;
  if (secret.startsWith(`${ENCRYPTED_PREFIX}:`)) return secret;

  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(secret),
  );

  return `${ENCRYPTED_PREFIX}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecretIfNeeded(secret: string): Promise<string> {
  if (!secret) return secret;
  if (!secret.startsWith(`${ENCRYPTED_PREFIX}:`)) return secret;

  const [, , ivBase64, cipherBase64] = secret.split(":");
  if (!ivBase64 || !cipherBase64) {
    throw new Error("Stored credential format is invalid.");
  }

  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(cipherBase64),
  );

  return textDecoder.decode(decrypted);
}
