import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk runs before every request so `auth()` can resolve the session server-side.
 *
 * The distinction that matters: the landing page is public, everything the club
 * actually does is not. Protecting `/` sent a signed-out visitor straight to
 * sign-in, so nobody ever saw the front door. The club's own screens sit behind
 * a list rather than a blanket rule, so adding one later does not require
 * remembering to guard it.
 */
const PUBLIC_ROUTES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/terms(.*)",
  "/privacy(.*)",
];

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  // API routes are guarded at the route itself rather than by redirect: a fetch
  // that follows a 302 to an HTML sign-in page receives HTML where it expected
  // JSON, and the client reports it as a broken server rather than a session that
  // has ended. `requireSession` returns 401 and the app signs the person out
  // properly.
  if (request.nextUrl.pathname.startsWith("/api")) return;

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
