import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { join, normalize } from "https://deno.land/std@0.168.0/path/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    await requireUser(req);

    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) {
      return jsonResponse({ error: "taskId is required." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase is not configured.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: taskRow, error } = await supabase
      .from("tasks")
      .select("result")
      .eq("id", taskId)
      .maybeSingle();

    if (error) throw error;
    if (!taskRow) {
      return jsonResponse({ error: "Task not found." }, 404);
    }

    const result = taskRow.result && typeof taskRow.result === "object" && !Array.isArray(taskRow.result)
      ? taskRow.result as Record<string, unknown>
      : null;

    const savedFilePath = pickString(result?.saved_file_path);
    if (!savedFilePath) {
      return jsonResponse({ error: "This task does not have a saved website file." }, 404);
    }

    const homeDir = Deno.env.get("HOME");
    if (!homeDir) {
      throw new Error("HOME is not available.");
    }

    const websitesDir = normalize(join(homeDir, "Documents", "websites"));
    const normalizedFilePath = normalize(savedFilePath);
    const allowedPrefix = `${websitesDir}/`;

    if (normalizedFilePath !== websitesDir && !normalizedFilePath.startsWith(allowedPrefix)) {
      return jsonResponse({ error: "Saved website path is outside the allowed directory." }, 403);
    }

    const html = await Deno.readTextFile(normalizedFilePath);
    const fileName = pickString(result?.saved_file_name) || normalizedFilePath.split("/").pop() || "website.html";

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("open-website error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
