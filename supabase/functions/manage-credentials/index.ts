import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { decryptSecretIfNeeded, encryptSecret } from "../_shared/credential-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getOpenRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": Deno.env.get("OPENROUTER_APP_NAME") || "AI Mission Control",
  };
  const referer = Deno.env.get("OPENROUTER_SITE_URL") || Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL");
  if (referer) headers["HTTP-Referer"] = referer;
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function claimCredentialMetaIfNeeded(supabase: any, credentialMetaId: string, userId: string) {
  const { data: meta, error } = await supabase
    .from("credentials_meta")
    .select("*")
    .eq("id", credentialMetaId)
    .maybeSingle();

  if (error) throw error;
  if (!meta) return null;
  if (meta.owner_user_id && meta.owner_user_id !== userId) return null;
  if (meta.owner_user_id === userId) return meta;

  const { data: claimed, error: claimError } = await supabase
    .from("credentials_meta")
    .update({ owner_user_id: userId })
    .eq("id", credentialMetaId)
    .is("owner_user_id", null)
    .select("*")
    .single();

  if (claimError) throw claimError;
  return claimed;
}

async function loadCredentialValue(supabase: any, credentialMetaId: string, userId: string) {
  const { data: valueRow, error } = await supabase
    .from("credential_values")
    .select("id, encrypted_value, owner_user_id")
    .eq("credential_meta_id", credentialMetaId)
    .maybeSingle();

  if (error) throw error;
  if (!valueRow) return null;
  if (valueRow.owner_user_id && valueRow.owner_user_id !== userId) return null;
  if (valueRow.owner_user_id === userId) return valueRow;

  const { data: claimed, error: claimError } = await supabase
    .from("credential_values")
    .update({ owner_user_id: userId })
    .eq("credential_meta_id", credentialMetaId)
    .is("owner_user_id", null)
    .select("id, encrypted_value, owner_user_id")
    .single();

  if (claimError) throw claimError;
  return claimed;
}

async function readCredentialSecret(supabase: any, credentialMetaId: string, userId: string) {
  const valueRow = await loadCredentialValue(supabase, credentialMetaId, userId);
  if (!valueRow?.encrypted_value) return null;

  const plaintext = await decryptSecretIfNeeded(valueRow.encrypted_value);
  if (!valueRow.encrypted_value.startsWith("enc:v1:")) {
    await supabase
      .from("credential_values")
      .update({
        encrypted_value: await encryptSecret(plaintext),
        owner_user_id: userId,
      })
      .eq("credential_meta_id", credentialMetaId);
  }

  return plaintext;
}

type OpenRouterModelCandidate = {
  id: string;
  name: string;
  description: string;
};

type OpenRouterSuggestion = {
  modelId: string;
  modelName: string;
  source: "grok" | "catalog";
};

function normalizeModelLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[:/_-]+/g, " ")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeModelLookup(value: string) {
  return new Set(
    normalizeModelLookup(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function scoreOpenRouterCandidate(input: string, candidate: OpenRouterModelCandidate) {
  const rawInput = input.trim().toLowerCase();
  const rawCandidate = candidate.id.toLowerCase();
  const normalizedInput = normalizeModelLookup(input);
  const normalizedCandidate = normalizeModelLookup(`${candidate.id} ${candidate.name}`);
  const compactInput = rawInput.replace(/[^a-z0-9]/g, "");
  const compactCandidate = rawCandidate.replace(/[^a-z0-9]/g, "");
  const inputTokens = tokenizeModelLookup(input);
  const candidateTokens = tokenizeModelLookup(`${candidate.id} ${candidate.name}`);

  let score = 0;

  if (rawCandidate === rawInput) score += 1000;
  if (rawCandidate.startsWith(rawInput) && rawInput) score += 180;
  if (rawCandidate.includes(rawInput) && rawInput) score += 120;
  if (normalizedCandidate.includes(normalizedInput) && normalizedInput) score += 140;

  for (const token of inputTokens) {
    if (candidateTokens.has(token)) {
      score += token.length >= 4 ? 40 : 18;
    }

    if (token === "online" && rawCandidate.endsWith(":online")) {
      score += 35;
    }
  }

  if (rawInput.includes("grok") && rawCandidate.includes("grok")) score += 40;
  if (rawInput.includes("x") && rawCandidate.startsWith("x-ai/")) score += 10;

  if (compactInput && compactCandidate) {
    const distance = levenshteinDistance(compactInput, compactCandidate);
    const maxLength = Math.max(compactInput.length, compactCandidate.length);
    const similarity = maxLength === 0 ? 0 : 1 - distance / maxLength;
    score += Math.max(0, Math.round(similarity * 120) - 35);
  }

  return score;
}

function shouldSuggestOpenRouterCorrection(errorText: string) {
  const normalized = errorText.toLowerCase();
  return [
    "model",
    "endpoint",
    "unknown",
    "not found",
    "invalid",
    "unsupported",
  ].some((token) => normalized.includes(token));
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function fetchOpenRouterModelCandidates() {
  const response = await fetch(`${OPENROUTER_BASE_URL}/models`);
  if (!response.ok) return [];

  const payload = await response.json().catch(() => ({}));
  const modelEntries = Array.isArray(payload?.data)
    ? payload.data as Array<Record<string, unknown>>
    : [];
  const baseModels = modelEntries
    .filter((entry) => typeof entry.id === "string")
    .map((entry) => ({
      id: entry.id as string,
      name: typeof entry.name === "string" ? entry.name : entry.id as string,
      description: typeof entry.description === "string" ? entry.description : "",
    }));

  const allModels = [...baseModels];
  const knownIds = new Set(baseModels.map((entry) => entry.id));

  for (const entry of baseModels) {
    if (!entry.id.startsWith("x-ai/grok")) continue;
    const onlineId = `${entry.id}:online`;
    if (knownIds.has(onlineId)) continue;

    allModels.push({
      id: onlineId,
      name: `${entry.name} Online`,
      description: `${entry.description}\nLive web and X search via OpenRouter online mode.`,
    });
  }

  return allModels;
}

async function askGrokForOpenRouterSuggestion(
  apiKey: string,
  attemptedModelId: string,
  candidates: OpenRouterModelCandidate[],
): Promise<OpenRouterSuggestion | null> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model: "x-ai/grok-4.1-fast",
      max_tokens: 120,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You correct likely mistyped OpenRouter model IDs. Choose exactly one model ID from the provided candidates or null if none fits. Return JSON only in the form {\"model_id\":\"...\"} or {\"model_id\":null}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            attempted_model_id: attemptedModelId,
            candidates: candidates.map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => ({}));
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = typeof content === "string" ? extractFirstJsonObject(content) : null;
  const suggestedId = typeof parsed?.model_id === "string" ? parsed.model_id : null;

  if (!suggestedId) return null;

  const match = candidates.find((candidate) => candidate.id === suggestedId);
  if (!match) return null;

  return {
    modelId: match.id,
    modelName: match.name,
    source: "grok",
  };
}

async function suggestOpenRouterModel(
  apiKey: string,
  attemptedModelId: string,
): Promise<OpenRouterSuggestion | null> {
  const candidates = await fetchOpenRouterModelCandidates().catch(() => []);
  if (!candidates.length) return null;

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreOpenRouterCandidate(attemptedModelId, candidate),
    }))
    .filter((entry) => entry.score >= 45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  if (!ranked.length) return null;

  const grokSuggestion = await askGrokForOpenRouterSuggestion(
    apiKey,
    attemptedModelId,
    ranked.map((entry) => entry.candidate),
  ).catch(() => null);

  if (grokSuggestion) return grokSuggestion;

  const fallback = ranked[0];
  if (!fallback || fallback.score < 70) return null;

  return {
    modelId: fallback.candidate.id,
    modelName: fallback.candidate.name,
    source: "catalog",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, credential_meta_id, value, model_id } = await req.json();

    if (action === "set") {
      if (!credential_meta_id || !value) {
        return jsonResponse({ error: "credential_meta_id and value required" }, 400);
      }

      const meta = await claimCredentialMetaIfNeeded(supabase, credential_meta_id, userId);
      if (!meta) {
        return jsonResponse({ error: "Credential not found." }, 404);
      }

      const { error: valErr } = await supabase.from("credential_values").upsert({
        credential_meta_id,
        owner_user_id: userId,
        encrypted_value: await encryptSecret(String(value)),
      }, { onConflict: "credential_meta_id" });

      if (valErr) throw valErr;

      await supabase.from("credentials_meta")
        .update({ is_set: true, last_verified_at: new Date().toISOString(), owner_user_id: userId })
        .eq("id", credential_meta_id);

      return jsonResponse({ success: true });
    }

    if (action === "unset") {
      if (!credential_meta_id) {
        return jsonResponse({ error: "credential_meta_id required" }, 400);
      }

      const meta = await claimCredentialMetaIfNeeded(supabase, credential_meta_id, userId);
      if (!meta) {
        return jsonResponse({ error: "Credential not found." }, 404);
      }

      await supabase.from("credential_values").delete().eq("credential_meta_id", credential_meta_id);
      await supabase.from("credentials_meta")
        .update({ is_set: false, last_verified_at: null, masked_value: null, owner_user_id: userId })
        .eq("id", credential_meta_id);

      return jsonResponse({ success: true });
    }

    if (action === "test") {
      if (!credential_meta_id) {
        return jsonResponse({ error: "credential_meta_id required" }, 400);
      }

      const meta = await claimCredentialMetaIfNeeded(supabase, credential_meta_id, userId);
      const apiKey = meta ? await readCredentialSecret(supabase, credential_meta_id, userId) : null;

      if (!meta || !apiKey) {
        return jsonResponse({ success: false, error: "Credential not found or not set" });
      }

      const testResult = { valid: false, error: "" };
      const provider = meta.provider.toLowerCase();

      try {
        if (provider === "openai") {
          const r = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "openrouter") {
          const r = await fetch(`${OPENROUTER_BASE_URL}/key`, {
            headers: getOpenRouterHeaders(apiKey),
          });
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "anthropic") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          testResult.valid = r.status !== 401 && r.status !== 403;
          if (!testResult.valid) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "google" || provider === "gemini") {
          // Try v1beta first for newer models, fallback to v1
          let r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          );
          if (!r.ok) {
            r = await fetch(
              `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
            );
          }
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else {
          testResult.valid = true;
        }
      } catch (e) {
        testResult.error = e instanceof Error ? e.message : "Test failed";
      }

      if (testResult.valid) {
        await supabase.from("credentials_meta")
          .update({ last_verified_at: new Date().toISOString(), owner_user_id: userId })
          .eq("id", credential_meta_id);
      }

      return jsonResponse({ success: testResult.valid, error: testResult.error });
    }

    // Verify a specific model_id works with a credential
    if (action === "verify_model") {
      if (!credential_meta_id || !model_id) {
        return jsonResponse({ error: "credential_meta_id and model_id required" }, 400);
      }

      const meta = await claimCredentialMetaIfNeeded(supabase, credential_meta_id, userId);
      const apiKey = meta ? await readCredentialSecret(supabase, credential_meta_id, userId) : null;

      if (!meta || !apiKey) {
        return jsonResponse({ success: false, error: "Credential not found or not set" });
      }

      const provider = meta.provider.toLowerCase();
      const result: {
        success: boolean;
        error: string;
        suggested_model_id?: string;
        suggested_model_name?: string;
        suggestion_source?: "grok" | "catalog";
      } = { success: false, error: "" };

      try {
        if (provider === "openai") {
          // Try a minimal completion to verify the model exists
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_completion_tokens: 16,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "openrouter") {
          const r = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: getOpenRouterHeaders(apiKey),
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
            if (shouldSuggestOpenRouterCorrection(result.error)) {
              const suggestion = await suggestOpenRouterModel(apiKey, String(model_id)).catch(() => null);
              if (suggestion && suggestion.modelId !== model_id) {
                result.suggested_model_id = suggestion.modelId;
                result.suggested_model_name = suggestion.modelName;
                result.suggestion_source = suggestion.source;
              }
            }
          }
        } else if (provider === "anthropic") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "google" || provider === "gemini") {
          const payload = {
            contents: [{ role: "user", parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 },
          };

          // Try v1beta first (newer models), then v1.
          let r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model_id}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
          if (!r.ok) {
            r = await fetch(
              `https://generativelanguage.googleapis.com/v1/models/${model_id}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }
            );
          }
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "groq") {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "mistral") {
          const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "deepseek") {
          const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else {
          // Unknown provider - can't verify model, just check key works
          result.success = true;
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : "Verification failed";
      }

      return jsonResponse(result);
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("manage-credentials error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
