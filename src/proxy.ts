import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase auth cookie on every request. Without this, sessions
 * would expire after one hour and users would randomly get logged out.
 *
 * We also gate protected routes here: unauthenticated visits to `/` or
 * `/history` get redirected to `/login`, while `/login` + `/auth/*` are left
 * open. `/api/*` is left untouched — routes handle their own auth checks.
 *
 * Next.js 16 renamed `middleware.ts` → `proxy.ts` and the exported function
 * `middleware` → `proxy`. Semantics are otherwise identical.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // When env vars aren't configured yet (e.g. first-run dev before Supabase is
  // set up) just pass through without auth checks so the dev server doesn't
  // crash on every request.
  if (!supabaseUrl || !supabaseAnon) {
    return response;
  }

  // Demo mode bypasses real auth; the `demo_user` cookie decides identity.
  // We still run the rest of the response pipeline normally.
  if (process.env.DEMO_MODE === "1") {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnon,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Exclude static files and favicon; everything else runs through middleware.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
