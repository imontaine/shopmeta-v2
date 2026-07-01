// src/lib/get-origin.ts
// Derives the true public origin (scheme + host) from an incoming Request.
//
// Problem: TanStack Start runs on a plain Node.js HTTP server. When the app
// is deployed behind a reverse proxy (Nginx, Caddy, Dokploy, etc.), TLS is
// terminated upstream and the internal request arrives as http://... even
// though the public URL is https://...
//
// The MCP SDK's OAuth validator rejects http:// redirect_uris for non-localhost
// hosts (RFC 8252 §8.3 / MCP spec §2.3.1). We must supply the correct https://
// origin or OAuth initialization will throw:
//   "HTTP URIs only allowed for localhost and private networks"
//
// Solution: check standard reverse-proxy forwarding headers first, then fall
// back to the raw request URL (which is correct on localhost dev).
//
// Header priority:
//   1. x-forwarded-proto + x-forwarded-host  (most proxies: nginx, caddy, traefik)
//   2. x-forwarded-proto + host              (when only proto is forwarded)
//   3. forwarded: proto=https;host=...       (RFC 7239, less common)
//   4. request.url origin                    (localhost dev — always http://)

/**
 * Returns the public-facing origin (e.g. "https://app.shopmeta.app") for a
 * server-side Request, honouring reverse-proxy forwarding headers.
 *
 * Safe to call in any TanStack Start server handler.
 */
export function getPublicOrigin(request: Request): string {
  const headers = request.headers

  // ── 1. x-forwarded-proto + x-forwarded-host ────────────────────────────────
  const xProto = headers.get('x-forwarded-proto')
  const xHost  = headers.get('x-forwarded-host') ?? headers.get('host')

  if (xProto && xHost) {
    // x-forwarded-proto may contain a comma-separated list when chained through
    // multiple proxies; the leftmost value is the original client scheme.
    const proto = xProto.split(',')[0]!.trim()
    const host  = xHost.split(',')[0]!.trim()
    if (proto && host) {
      return `${proto}://${host}`
    }
  }

  // ── 2. forwarded: proto=https;host=app.shopmeta.app (RFC 7239) ─────────────
  const forwarded = headers.get('forwarded')
  if (forwarded) {
    const protoMatch = /proto=([^;,\s]+)/i.exec(forwarded)
    const hostMatch  = /host=([^;,\s]+)/i.exec(forwarded)
    if (protoMatch?.[1] && hostMatch?.[1]) {
      return `${protoMatch[1]}://${hostMatch[1]}`
    }
  }

  // ── 3. Fallback: raw request URL origin (correct for localhost dev) ─────────
  return new URL(request.url).origin
}
