import { supabase } from "@/integrations/supabase/client";

let sessionBootstrap: Promise<string> | null = null;

async function createAnonymousSession(): Promise<string> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Supabase did not return an access token.");
  }
  return accessToken;
}

export async function ensureSession(): Promise<string> {
  if (sessionBootstrap) return sessionBootstrap;

  sessionBootstrap = (async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (session?.access_token) return session.access_token;

    return createAnonymousSession();
  })();

  try {
    return await sessionBootstrap;
  } finally {
    sessionBootstrap = null;
  }
}

export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (session?.access_token) return session.access_token;

  return ensureSession();
}
