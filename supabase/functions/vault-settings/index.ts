import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import {
  decodeBase64,
  decodeUtf8,
  encodeBase64,
  encodeUtf8,
  ensureWorkspaceScaffold,
  pathExists,
  readTextFile,
  workspacePath,
  writeTextFile,
} from "../_shared/claw-workspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const textEncoder = new TextEncoder();

const VAULT_PREFIX = "vault:v1";
const VAULT_FILE = workspacePath("vault", "settings", "agent-tool-permissions.enc");

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PermissionsSnapshot = {
  updated_at: string;
  agent_permissions: Record<string, string[]>;
};

async function deriveKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPayload(password: string, payload: PermissionsSnapshot) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeUtf8(JSON.stringify(payload)),
  );

  return `${VAULT_PREFIX}:${encodeBase64(salt)}:${encodeBase64(iv)}:${encodeBase64(new Uint8Array(cipher))}`;
}

async function decryptPayload(password: string, value: string): Promise<PermissionsSnapshot> {
  const [prefix, saltBase64, ivBase64, cipherBase64] = value.split(":");
  if (prefix !== VAULT_PREFIX || !saltBase64 || !ivBase64 || !cipherBase64) {
    throw new Error("Vault file format is invalid.");
  }

  const key = await deriveKey(password, decodeBase64(saltBase64));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(ivBase64) },
    key,
    decodeBase64(cipherBase64),
  );

  const parsed = JSON.parse(decodeUtf8(plaintext));
  return {
    updated_at: typeof parsed?.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
    agent_permissions:
      parsed?.agent_permissions && typeof parsed.agent_permissions === "object"
        ? parsed.agent_permissions as Record<string, string[]>
        : {},
  };
}

async function loadPermissionsSnapshot(
  supabase: any,
  password?: string | null,
): Promise<PermissionsSnapshot> {
  await ensureWorkspaceScaffold();

  if (await pathExists(VAULT_FILE)) {
    if (!password) {
      throw new Error("Vault password required.");
    }
    return await decryptPayload(password, await readTextFile(VAULT_FILE));
  }

  const { data, error } = await supabase.from("agent_policies").select("agent_id, allowed_tools");
  if (error) throw error;

  return {
    updated_at: new Date().toISOString(),
    agent_permissions: Object.fromEntries(
      ((data || []) as Array<{ agent_id: string; allowed_tools: string[] | null }>).map((row) => [
        row.agent_id,
        row.allowed_tools || [],
      ]),
    ),
  };
}

async function syncPermissionsToPolicies(supabase: any, snapshot: PermissionsSnapshot, userId: string) {
  const rows = Object.entries(snapshot.agent_permissions).map(([agentId, allowedTools]) => ({
    agent_id: agentId,
    allowed_tools: allowedTools,
    updated_at: new Date().toISOString(),
    owner_user_id: userId,
  }));

  if (!rows.length) return;

  const { error } = await supabase
    .from("agent_policies")
    .upsert(rows, { onConflict: "agent_id" });

  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const password = typeof body.password === "string" ? body.password : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "status") {
      await ensureWorkspaceScaffold();
      return jsonResponse({ locked: await pathExists(VAULT_FILE), path: VAULT_FILE });
    }

    if (action === "read_permissions") {
      const snapshot = await loadPermissionsSnapshot(supabase, password);
      return jsonResponse({ snapshot });
    }

    if (action === "write_permissions") {
      if (!password) {
        return jsonResponse({ error: "Password is required." }, 400);
      }

      const agentPermissions =
        body.agent_permissions && typeof body.agent_permissions === "object"
          ? body.agent_permissions as Record<string, string[]>
          : null;

      if (!agentPermissions) {
        return jsonResponse({ error: "agent_permissions is required." }, 400);
      }

      const snapshot: PermissionsSnapshot = {
        updated_at: new Date().toISOString(),
        agent_permissions: Object.fromEntries(
          Object.entries(agentPermissions).map(([agentId, tools]) => [
            agentId,
            Array.isArray(tools)
              ? tools.filter((tool): tool is string => typeof tool === "string").sort()
              : [],
          ]),
        ),
      };

      const encrypted = await encryptPayload(password, snapshot);
      await writeTextFile(VAULT_FILE, encrypted);
      await syncPermissionsToPolicies(supabase, snapshot, userId);
      return jsonResponse({ success: true, snapshot });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("vault-settings error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
