import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware: protect /dashboard and /api/* routes behind simple password auth.
 * Login page and auth endpoints are always accessible.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: login page, auth API, static assets, favicon
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authToken = request.cookies.get("auth_token")?.value;
  if (authToken !== "authenticated") {
    // Redirect to login for page requests
    if (!pathname.startsWith("/api/")) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
    // Return 401 for API requests
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/generate/:path*", "/api/publish/:path*", "/api/drafts/:path*", "/api/canva/:path*"],
};
