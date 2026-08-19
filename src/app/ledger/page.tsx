import { AllowlistGate } from "@/components/allowlist-gate";
import { LedgerPanel } from "@/components/ledger-panel";
import { Shell } from "@/components/shell";

export default function LedgerPage() {
  return (
    <AllowlistGate>
      <Shell current="/ledger" title="Ledger" description="Recent gateway requests and upstream errors.">
        <LedgerPanel />
      </Shell>
    </AllowlistGate>
  );
}
