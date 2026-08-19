import { generateIssuedKey } from "@/lib/issued-key";
import { operatorFailed, requireOperator } from "@/lib/operator";
import { insertIssuedKey, listIssuedKeys } from "@/lib/vault";

export async function GET() {
  try {
    await requireOperator();
    return Response.json({ keys: await listIssuedKeys() });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireOperator();
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      allowlist?: string[] | null;
    };
    const generated = generateIssuedKey();
    const row = await insertIssuedKey({
      name: body.name?.trim() || "default",
      prefix: generated.prefix,
      hash: generated.hash,
      allowlist: body.allowlist?.length ? body.allowlist : null,
    });
    return Response.json({
      key: {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        secret: generated.secret,
      },
    });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
