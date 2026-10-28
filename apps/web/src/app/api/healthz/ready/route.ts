import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { withinDeadline } from "@/lib/health";

export const dynamic = "force-dynamic";

function hasRequiredEnv() {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  return {
    missing,
    ok: missing.length === 0,
  };
}

export async function GET() {
  const env = hasRequiredEnv();
  let database = false;
  if (env.ok) {
    try {
      const result = await withinDeadline((signal) =>
        supabase.from("flights_current").select("id").limit(1).abortSignal(signal)
      );
      database = !result.error;
    } catch {
      // Do not return database errors, URLs or credentials in public health output.
    }
  }
  const ready = env.ok && database;

  return NextResponse.json(
    {
      status: ready ? "ready" : "degraded",
      check: "ready",
      timestamp: new Date().toISOString(),
      missingEnv: env.missing,
      database: database ? "reachable" : "unavailable",
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
