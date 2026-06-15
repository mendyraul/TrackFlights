import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Apply only to API routes. The map snapshot is CDN-cached, so genuine function
// invocations are low; this exists to blunt abusive bursts, not normal traffic.
export const config = {
  matcher: ["/api/:path*"],
};

const LIMIT = Number(process.env.RATE_LIMIT_MAX ?? 120);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

function clientIp(req: NextRequest): string {
  // NextRequest.ip is removed in Next 15; derive from forwarding headers.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function middleware(req: NextRequest) {
  const ip = clientIp(req);
  const { allowed, remaining, resetAt, retryAfterSec } = checkRateLimit(`api:${ip}`, {
    limit: LIMIT,
    windowMs: WINDOW_MS,
  });

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(LIMIT),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };

  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(retryAfterSec) },
      }
    );
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}
