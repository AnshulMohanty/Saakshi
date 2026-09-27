import Link from "next/link";

const NAV = [
  { href: "/library", label: "Library" },
  { href: "/review", label: "Review" },
  { href: "/studio", label: "Studio" },
  { href: "/capture", label: "Capture" },
] as const;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/" className="font-heading font-semibold">
            Saakshi
          </Link>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
