/**
 * Proxy for fetching a generated asset.
 *
 * It exists because provider-hosted video URLs sometimes need an API key that
 * must not reach the browser, and because reading the bytes server-side avoids
 * CORS problems on the download path.
 *
 * SECURITY: this endpoint used to fetch whatever URL it was handed and attach
 * GOOGLE_API_KEY to the request. That let anyone who could reach it use the
 * server as an open proxy into private address space and — worse — read the API
 * key straight out of the request headers by pointing `url` at a host they
 * controlled. Both are fixed by allowlisting the hosts we are willing to fetch
 * and only ever sending the key to Google.
 */

const GOOGLE_ASSET_HOSTS = new Set(["generativelanguage.googleapis.com"]);

function supabaseHost(): string | null {
  const configured = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).host;
  } catch {
    return null;
  }
}

type Target = { url: URL; useGoogleKey: boolean };

export function resolveTarget(raw: string): Target | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // http:// would allow a downgrade to a plaintext hop, and non-http schemes
  // (file:, data:, gopher:) have no business here at all.
  if (parsed.protocol !== "https:") return null;

  if (GOOGLE_ASSET_HOSTS.has(parsed.host)) return { url: parsed, useGoogleKey: true };

  const storageHost = supabaseHost();
  if (storageHost && parsed.host === storageHost) return { url: parsed, useGoogleKey: false };

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("url");
  // Strip anything that could break out of the header value or write a path.
  const filename = (searchParams.get("filename") || "asset").replace(/[^\w.\-]/g, "_");

  if (!requested) return new Response("Missing url", { status: 400 });

  const target = resolveTarget(requested);
  if (!target) {
    console.warn("[assets/download] refused a non-allowlisted target", { requested });
    return new Response("Unsupported asset host", { status: 400 });
  }

  try {
    const response = await fetch(target.url, {
      headers:
        target.useGoogleKey && process.env.GOOGLE_API_KEY
          ? { "x-goog-api-key": process.env.GOOGLE_API_KEY }
          : {},
      redirect: "follow",
    });

    if (!response.ok || !response.body) {
      console.error("[assets/download] upstream refused", { host: target.url.host, status: response.status });
      return new Response("Failed to fetch asset", { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[assets/download] proxy failed", error);
    return new Response("Server error", { status: 500 });
  }
}
