import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm text-muted-foreground">साक्षी · witness</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Saakshi</h1>
      <p className="text-lg text-muted-foreground">
        Field photos in, verified proof of impact out. Every photo is ingested with its metadata,
        checked by a rule-based Trust Engine, measured before and after, and every number in a
        report links back to the photo it came from.
      </p>
      <div className="flex gap-3">
        <Link href="/library" className={buttonVariants()}>
          Open the app
        </Link>
        <Link href="/dev/status" className={buttonVariants({ variant: "outline" })}>
          Provider status
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">Landing page placeholder; designed in Phase 7.</p>
    </main>
  );
}
