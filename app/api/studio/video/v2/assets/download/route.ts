export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const filename = searchParams.get("filename") || "video.mp4";
  const googleApiKey = process.env.GOOGLE_API_KEY;

  if (!url) {
    return new Response("Missing URL", { status: 400 });
  }

  try {
    const headers: HeadersInit = googleApiKey
      ? { "x-goog-api-key": googleApiKey }
      : {};

    const response = await fetch(url, {
      headers
    });

    if (!response.ok || !response.body) {
      return new Response("Failed to fetch video", { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });

  } catch (err) {
    return new Response("Server error", { status: 500 });
  }
}
