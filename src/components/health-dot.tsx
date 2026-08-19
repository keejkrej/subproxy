import type { Health } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const variants: Record<Health, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  expiring: "secondary",
  expired: "destructive",
  error: "destructive",
  unknown: "outline",
};

export function HealthDot({ health }: { health: Health }) {
  return (
    <Badge variant={variants[health]} className="capitalize">
      {health}
    </Badge>
  );
}
