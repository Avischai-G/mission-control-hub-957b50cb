import { getAccessToken } from "@/lib/auth-session";

const FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function callEdgeJson<TResponse = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Edge Function ${functionName} failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as TResponse;
}
