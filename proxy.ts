import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk runs before every request so `auth()` can resolve the session server-side.
 *
 * The matcher covers the API and the single client-rendered app. It does not try
 * to protect the sign-in screens: Clerk redirects an unauthenticated visitor to
 * `/sign-in` itself, and this file must not run where Clerk's own assets and
 * handshake requests live, or the redirect turns into a loop.
 */
const isProtectedRoute = createRouteMatcher(["/api(.*)", "/((?!sign-in|sign-up).*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isProtectedRoute(request)) return;

  // API routes are guarded at the route itself rather than by redirect: a fetch
  // that follows a 302 to an HTML sign-in page receives HTML where it expected
  // JSON, and the client reports it as a broken server rather than a session that
  // has ended. `requireSession` returns 401 and the app signs the person out
  // properly.
  if (request.nextUrl.pathname.startsWith("/api")) return;

  // The app is a single client-rendered surface behind authentication. Clerk
  // redirects here when there is no session, and `requestUrl` keeps the person on
  // the page they were trying to reach.
  await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
  });
});

export const config = {
  matcher: [
    // Everything except Next's own internals and static files. The negative
    // lookaheads keep images and CSS out of the middleware's path entirely.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // API routes are matched explicitly so they are never excluded by the
    // extension rules above.
    "/(api|trpc)(.*)",
  ],
};
