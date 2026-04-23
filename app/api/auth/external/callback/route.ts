import {
  exchangePilotOauthCodeForAccessToken,
  getPilotOauthSession,
  setPilotOauthSessionFailed,
} from "@/lib/pilot-oauth";

export const dynamic = "force-dynamic";

function html(body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ciallo OAuth</title></head><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0f1115;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="max-width:560px;padding:20px;border:1px solid rgba(255,255,255,.12);background:#151922;border-radius:12px;line-height:1.6">${body}</div></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const error = url.searchParams.get("error")?.trim();

  if (!state) {
    return html("<h2>Authorization failed</h2><p>Missing <code>state</code>. Please close this page and try again.</p>");
  }

  const session = getPilotOauthSession(state);
  if (!session) {
    return html("<h2>Session expired</h2><p>This authorization session has expired. Please return to the client and restart authorization.</p>");
  }

  if (error) {
    setPilotOauthSessionFailed(state, error);
    return html("<h2>Authorization denied</h2><p>Access was not granted. You can return to the client and retry.</p>");
  }

  if (!code) {
    setPilotOauthSessionFailed(state, "missing_code");
    return html("<h2>Authorization failed</h2><p>Missing <code>code</code>. Please return to the client and retry.</p>");
  }

  try {
    await exchangePilotOauthCodeForAccessToken({ state, code });
    return html("<h2>Authorization successful</h2><p>You can now return to Ciallo ACARS. This page can be closed.</p>");
  } catch (err) {
    setPilotOauthSessionFailed(state, err instanceof Error ? err.message : "oauth_exchange_failed");
    return html("<h2>Authorization failed</h2><p>Token exchange failed. Please return to client and try again.</p>");
  }
}
