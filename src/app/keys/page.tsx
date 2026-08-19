import { AllowlistGate } from "@/components/allowlist-gate";
import { KeysPanel } from "@/components/keys-panel";
import { Shell } from "@/components/shell";
import { appUrl } from "@/lib/env";

export default function KeysPage() {
  return (
    <AllowlistGate>
      <Shell current="/keys" title="Issued keys" description="Mint gateway keys for OpenAI-compatible clients.">
        <KeysPanel appUrl={appUrl()} />
      </Shell>
    </AllowlistGate>
  );
}
