const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const upstream = await fetch(`${BACKEND_URL}/edit/color-to-alpha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      let detail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) detail = errorJson.detail;
      } catch {
        // use fallback text
      }
      return Response.json({ detail }, { status: upstream.status });
    }

    const responseBody = await upstream.arrayBuffer();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": "image/png",
      },
    });
  } catch {
    return Response.json(
      { detail: `Could not reach backend at ${BACKEND_URL}.` },
      { status: 502 },
    );
  }
}
