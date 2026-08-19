import { AllowlistGate } from "@/components/allowlist-gate";
import { ModelsPanel } from "@/components/models-panel";
import { Shell } from "@/components/shell";

export default function ModelsPage() {
  return (
    <AllowlistGate>
      <Shell
        current="/models"
        title="Models"
        description="Names clients send to /v1. Must start with chatgpt/ or supergrok/."
      >
        <ModelsPanel />
      </Shell>
    </AllowlistGate>
  );
}
