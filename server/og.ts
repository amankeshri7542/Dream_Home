// GET /api/og?id=… — the page link-preview robots (WhatsApp, Facebook,
// Telegram, X…) read when someone pastes a share link. vercel.json sends only
// those robots here; people get the app itself. Tiny, static, no scripts.
import { SHARE_ID } from "../src/domain/persist";
import { kvFor, type Deps } from "./context";
import { publicOrigin, type Env } from "./http";
import { publicName, type ShareMeta } from "./share";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const DESCRIPTION = "A 3D home designed on Dream Home — tap to walk inside.";

export function ogPage({ title, url, image }: { title: string; url: string; image?: string }): string {
  const t = escapeHtml(title),
    u = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dream Home">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${u}">
${
  image
    ? `<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`
    : `<meta name="twitter:card" content="summary">`
}
</head>
<body><p><a href="${u}">${t}</a></p></body>
</html>`;
}

export async function handleOg(request: Request, env: Env, deps: Deps): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const origin = publicOrigin(request, env);
  let meta: ShareMeta | null = null;
  if (SHARE_ID.test(id)) {
    try {
      const text = await kvFor(env, deps)?.get(`dh:v1:share:${id}`);
      meta = text ? (JSON.parse(text) as ShareMeta) : null;
    } catch {
      meta = null;
    }
  }
  const live = meta && !meta.hidden;
  const html = ogPage({
    title: live ? `${publicName(meta!.name)} — a home on Dream Home` : "Dream Home — design your home in 3D",
    url: live ? `${origin}/h/${id}` : origin,
    image: live && meta!.image ? `${origin}/api/share/${id}/image?v=${meta!.updatedAt}` : undefined,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
