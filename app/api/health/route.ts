export async function GET() {
  return Response.json({
    ok: true,
    service: "phoenix-api",
    timestamp: new Date().toISOString(),
  });
}
