import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function hasRequiredEnv() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  return {
    missing,
    ok: missing.length === 0
  };
}

export async function GET() {
  const env = hasRequiredEnv();

  return NextResponse.json(
    {
      status: env.ok ? 'ready' : 'degraded',
      check: 'ready',
      timestamp: new Date().toISOString(),
      missingEnv: env.missing
    },
    { status: env.ok ? 200 : 503 }
  );
}
