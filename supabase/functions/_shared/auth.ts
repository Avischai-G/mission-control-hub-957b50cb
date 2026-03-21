import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CallerContext = {
  mode: "user" | "service_role" | "anonymous";
  userId: string | null;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function getCallerContext(req: Request): Promise<CallerContext> {
  const token = getBearerToken(req);
  if (!token) {
    return { mode: "anonymous", userId: null };
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) {
    return { mode: "service_role", userId: null };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceRoleKey) {
    return { mode: "anonymous", userId: null };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) {
    return { mode: "anonymous", userId: null };
  }

  return { mode: "user", userId: data.user.id };
}

export async function requireUser(req: Request): Promise<{ userId: string }> {
  const caller = await getCallerContext(req);
  if (caller.mode !== "user" || !caller.userId) {
    throw new Error("Authentication required.");
  }

  return { userId: caller.userId };
}
