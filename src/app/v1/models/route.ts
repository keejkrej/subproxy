import { authenticateIssuedKey, GatewayError } from "@/lib/gateway";
import { catalogFor } from "@/lib/providers";
import { listSessions } from "@/lib/vault";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authenticateIssuedKey(req.headers.get("authorization"));
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 500;
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "unauthorized", type: "api_error" } },
      { status },
    );
  }
  const rows = await listSessions();
  const models = rows
    .filter((row) => row.health === "healthy" || row.health === "expiring")
    .flatMap((row) => catalogFor(row.provider));
  return Response.json({
    object: "list",
    data: models.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "subproxy",
    })),
  });
}
