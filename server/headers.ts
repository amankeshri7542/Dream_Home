// The site's security headers, defined once. vercel.json must match
// `vercelHeaders()` (a unit test checks), and `vite preview` serves the same
// set so the Content-Security-Policy can be tested locally before deploying.

const CSP: Record<string, string> = {
  "default-src": "'self'",
  // The meshopt decoder compiles WebAssembly; nothing uses eval.
  "script-src": "'self' 'wasm-unsafe-eval'",
  // index.html has one small inline <style>; React sets style attributes.
  "style-src": "'self' 'unsafe-inline'",
  // data: for the inline favicon, blob: for photos and textures made in the page.
  "img-src": "'self' data: blob:",
  "media-src": "'self' blob:",
  "font-src": "'self'",
  // blob: because GLTFLoader fetches embedded textures through object URLs.
  "connect-src": "'self' blob:",
  "worker-src": "'self' blob:",
  "manifest-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'none'",
};

export const CONTENT_SECURITY_POLICY = Object.entries(CSP)
  .map(([directive, value]) => `${directive} ${value}`)
  .join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

/** The `headers` block of vercel.json. */
export const vercelHeaders = () => [
  {
    source: "/(.*)",
    headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
  },
];
