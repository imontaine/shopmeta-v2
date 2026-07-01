// src/lib/get-origin.ts
// Derives the true public origin (scheme + host) from an incoming Request.
//
// Problem: TanStack Start runs on a plain Node.js HTTP server. When the app
// is deployed behind a reverse proxy (Nginx, Caddy, Traefik, Dokploy, etc.),
// TLS is terminated upstream and the internal request arrives as http://...
// even though the public URL is https://...
//
// The MCP SDK's OAuth validator rejects http:// redirect_uris for non-localhost
// hosts (RFC 8252 §8.3 / MCP spec §2.3.1). We must supply the correct https://
// origin or OAuth initialization will throw:
//   "HTTP URIs only allowed for localhost and private networks"
//
// Resolution order:
//   1. APP_ORIGIN env var (explicit override - most reliable)
//   2. x-forwarded-proto + x-forwarded-host  (nginx, caddy, traefik)
//   3. x-forwarded-proto + host              (proto forwarded, host not)
//   4. forwarded: proto=https;host=...       (RFC 7239)
//   5. Raw request.url origin               (dev localhost — always correct)
//   6. Force https:// if host is not localhost/loopback/private IP
//      (last-resort for proxies that strip forwarding headers entirely)

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[::1\])/

/**
 * Returns the public-facing origin (e.g. "https://app.shopmeta.app") for a
 * server-side Request, honouring reverse-proxy forwarding headers.
 *
 * Safe to call in any TanStack Start server handler.
 */
export function getPublicOrigin(request: Request): string {
  // ── 1. APP_ORIGIN environment variable (explicit, highest priority) ──────────
  const appOrigin = process.env['APP_ORIGIN'] ?? process.env['BETTER_AUTH_URL']
  if (appOrigin) {
    try {
      // Normalize: strip trailing slash, keep only scheme+host
      const u = new URL(appOrigin.includes('://') ? appOrigin : `https://${appOrigin}`)
      return u.origin
    } catch {
      // Malformed - fall through
    }
  }

  const headers = request.headers

  // ── 2. x-forwarded-proto + x-forwarded-host ──────────────────────────────────
  const xProto = headers.get('x-forwarded-proto')
  const xHost  = headers.get('x-forwarded-host') ?? headers.get('host')

  if (xProto && xHost) {
    const proto = xProto.split(',')[0]!.trim()
    const host  = xHost.split(',')[0]!.trim()
    if (proto && host) return `${proto}://${host}`
  }

  // ── 3. forwarded: proto=https;host=app.shopmeta.app (RFC 7239) ───────────────
  const forwarded = headers.get('forwarded')
  if (forwarded) {
    const protoMatch = /proto=([^;,\s]+)/i.exec(forwarded)
    const hostMatch  = /host=([^;,\s]+)/i.exec(forwarded)
    if (protoMatch?.[1] && hostMatch?.[1]) {
      return `${protoMatch[1]}://${hostMatch[1]}`
    }
  }

  // ── 4. Raw request URL ────────────────────────────────────────────────────────
  const rawOrigin = new URL(request.url).origin

  // ── 5. Force https:// for non-localhost/non-private hosts ────────────────────
  // If we reach here behind a reverse proxy that doesn't forward headers, the
  // raw URL will be http:// for a public host. Upgrade it — any public hostname
  // reachable over the internet is always behind https in production.
  if (rawOrigin.startsWith('http://')) {
    const rawUrl = new URL(request.url)
    if (!PRIVATE_HOST_RE.test(rawUrl.hostname)) {
      rawUrl.protocol = 'https:'
      return rawUrl.origin
    }
  }

  return rawOrigin
}

