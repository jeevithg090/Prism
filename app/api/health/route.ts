// Health check for hosting platforms (Render health check, uptime pings).
export async function GET() {
  return Response.json({ ok: true, data: { service: "keystone", demo: process.env.DEMO_MODE === "true", ts: new Date().toISOString() } });
}
