import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { verifyAuditLog } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { getDbHandle, rowsOf } from "@/lib/db/client";

export const metadata = { title: "Provider status" };

async function databaseHealth() {
  try {
    const { db, kind } = await getDbHandle();
    const [row] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`));
    const audit = await verifyAuditLog(db);
    return { ok: true as const, kind, migrations: row?.n ?? 0, audit };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function StatusPage() {
  await connection(); // env and DB state are read per request, never at build time
  const config = getConfig();
  const providers = Object.values(config.providers);
  const health = await databaseHealth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Provider status</h1>
        <p className="text-sm text-muted-foreground">
          A provider is real only when all of its variables are set; otherwise its mock is used. Values
          are never shown here, only whether they are present.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Implementation</TableHead>
            <TableHead>Missing vars</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((p) => (
            <TableRow key={p.name}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant={p.mode === "real" ? "default" : "secondary"}>{p.mode}</Badge>
              </TableCell>
              <TableCell className="whitespace-normal">
                {p.implementation}
                {p.note ? <div className="text-xs text-muted-foreground">{p.note}</div> : null}
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-normal">
                {p.missingVars.length ? p.missingVars.join(", ") : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>{config.providers.db.implementation}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {health.ok ? (
              <ul className="space-y-1">
                <li>Connected ({health.kind}); {health.migrations} migrations applied.</li>
                <li>
                  Audit chain:{" "}
                  {health.audit.ok ? (
                    <Badge variant="secondary">intact · {health.audit.count} rows</Badge>
                  ) : (
                    <Badge variant="destructive">broken at row {health.audit.brokenAt}</Badge>
                  )}
                </li>
              </ul>
            ) : (
              <p className="text-destructive">{health.error}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Config</CardTitle>
            <CardDescription>
              {config.env.NODE_ENV} · APP_URL {config.appUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {config.warnings.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {config.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : (
              <p>No warnings.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
