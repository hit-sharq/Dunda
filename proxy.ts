import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";


const PUBLIC_ROUTES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  // Customer self-ordering: a guest scans the table QR and orders without an account.
  "/order(.*)",
  "/order-status(.*)",
  "/m(.*)",
  "/pay(.*)",
  "/api/public(.*)",
];

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);

function securityHeaders(response: NextResponse, request: NextRequest): void {
  // Content Security Policy.
  //
  // Note the worker-src and media-src directives. Clerk builds a web worker
  // from a blob URL, and the app previews audio with a data: source. Without
  // those two the browser refuses them, and without worker-src Clerk's
  // browser.js fails to initialise at all.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://cdn.jsdelivr.net https://unpkg.com https://*.clerk.accounts https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.com.dev https://*.vercel.app https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "connect-src 'self' https://*.clerk.accounts https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.com.dev https://clerk-telemetry.com https://api.stripe.com https://*.pesapal.com https://cybqa.pesapal.com https://pay.pesapal.com wss: https://*.vercel.app",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.clerk.accounts https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.com.dev",
    "base-uri 'self'",
    "form-action 'self' https://*.clerk.accounts https://*.clerk.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Strict transport security (only in production over HTTPS)
  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Permissions policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}

const clerk = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  
  
  
  
  
  
  if (request.nextUrl.pathname.startsWith("/api")) return;

  await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
  });
});

export default async function middleware(request: NextRequest) {
  const response = (await clerk(request, undefined as any)) as NextResponse;
  // Skip security headers for JSON API routes (they don't need CSP/HSTS)
  if (!request.nextUrl.pathname.startsWith("/api")) {
    securityHeaders(response, request);
  }
  return response;
}

export const config = {
  matcher: [
    
    
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    
    
    "/(api|trpc)(.*)",
  ],
};
