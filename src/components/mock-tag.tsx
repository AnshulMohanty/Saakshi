import { Badge } from "@/components/ui/badge";

/** Marks a value that came from a mock provider (development only; production never shows it). */
export function MockTag() {
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400" data-testid="mock-tag" title="Derived from a mock provider: hidden in production">
      Mock output
    </Badge>
  );
}
