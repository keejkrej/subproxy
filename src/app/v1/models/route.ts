import { authenticateIssuedKey, GatewayError } from "@/lib/gateway";
import { DEFAULT_MODELS } from "@/lib/catalog";
import { listModels } from "@/lib/vault";

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
  const catalog = await listModels();
  const models = catalog.length ? catalog.map((row) => row.name) : DEFAULT_MODELS.map((row) => row.name);
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
