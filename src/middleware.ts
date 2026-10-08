export { default } from "next-auth/middleware";

// Pages require a session. API routes check the session themselves (they return JSON 401 instead of a redirect).
export const config = {
  matcher: ["/((?!signin|api|_next/static|_next/image|favicon.ico).*)"],
};
