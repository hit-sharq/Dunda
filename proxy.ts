import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";


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

  
  
  
  
  
  if (request.nextUrl.pathname.startsWith("/api")) return;

  await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
  });
});

export const config = {
  matcher: [
    
    
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    
    
    "/(api|trpc)(.*)",
  ],
};