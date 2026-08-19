import { operatorFailed, requireOperator } from "@/lib/operator";
import { listLedger } from "@/lib/vault";

export async function GET() {
  try {
    await requireOperator();
    return Response.json({ ledger: await listLedger(150) });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
