import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Stand-in for pages that are built in later phases. */
export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Placeholder: built in {phase}.</CardDescription>
      </CardHeader>
      {children ? <CardContent className="text-sm text-muted-foreground">{children}</CardContent> : null}
    </Card>
  );
}
