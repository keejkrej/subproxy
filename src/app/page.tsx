import { AllowlistGate } from "@/components/allowlist-gate";
import { SessionsPanel } from "@/components/sessions-panel";
import { Shell } from "@/components/shell";

export default function HomePage() {
  return (
    <AllowlistGate>
      <Shell current="/" title="Sessions" description="Connect ChatGPT and SuperGrok over OAuth.">
        <SessionsPanel />
      </Shell>
    </AllowlistGate>
  );
}
