/* captadel.com edge worker — serves the built landing (dist/) from Cloudflare
   static assets. Path-driven languages: extensionless paths resolve to the SPA
   shells — anything under /ar → /ar/ (Arabic entry), everything else → /
   (English entry) — so deep links and refreshes never 404. Recovered verbatim
   from the deployed `captadel` Worker; keep in sync if edited in the dashboard. */
const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
  woff2: 'font/woff2', ico: 'image/x-icon'
};
function typeFor(path) {
  if (path.endsWith('/')) return MIME.html;
  const ext = path.split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}
function rewrite(res, type) {
  const h = new Headers(res.headers);
  h.set('content-type', type);
  return new Response(res.body, { status: res.status, headers: h });
}
async function assetFetch(env, request, origin, path, depth) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin), request));
  if (depth < 2 && res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) return assetFetch(env, request, origin, new URL(loc, origin).pathname, depth + 1);
  }
  return res;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;
    let path = decodeURIComponent(url.pathname);
    const last = path.split('/').pop();
    if (!last.includes('.')) {
      path = path.startsWith('/ar') ? '/ar/' : '/';
    }
    let res = await assetFetch(env, request, origin, path, 0);
    if (res.status === 404) {
      res = await assetFetch(env, request, origin, path.startsWith('/ar') ? '/ar/' : '/', 0);
      return rewrite(res, MIME.html);
    }
    return rewrite(res, typeFor(path));
  }
};
