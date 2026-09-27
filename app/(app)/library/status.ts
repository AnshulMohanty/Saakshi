/** Badge variant per asset status (colours come from the theme's CSS variables). */
export function statusVariant(status: string, failed = false): "default" | "secondary" | "destructive" | "outline" {
  if (failed || status === "flagged" || status === "rejected") return "destructive";
  if (status === "processing") return "secondary";
  if (status === "approved") return "default";
  return "outline";
}

/** Pin classes per status for the map (Tailwind, theme variables). */
export function pinClass(status: string, failed = false): string {
  if (failed || status === "flagged" || status === "rejected") return "bg-destructive";
  if (status === "processing") return "bg-muted-foreground animate-pulse";
  if (status === "approved") return "bg-chart-2";
  return "bg-primary";
}
