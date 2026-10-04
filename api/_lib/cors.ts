// Lets the iOS and Android apps call these functions. The apps' pages are
// served from the phone itself (capacitor://localhost on iOS, https://localhost
// on Android), so to the browser engine every call here is cross-origin and is
// blocked unless the response allows that origin. Only the apps' origins are
// allowed; the website calls from its own origin and never needs this.
// Members are identified by the bearer token on each call, not by cookies,
// so allowing an origin grants nothing a request without a valid token could use.

const APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

type Handler = (request: Request) => Promise<Response>;

function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin || !APP_ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Wraps a handler so its responses to the apps carry the CORS headers. */
export function withCors(handler: Handler): Handler {
  return async (request) => {
    const response = await handler(request);
    const cors = corsHeaders(request);
    if (!cors) return response;
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    headers.append("Vary", "Origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

/** The permission check the app's web view sends before each call. */
export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: { ...(corsHeaders(request) ?? {}), Vary: "Origin" } });
}
