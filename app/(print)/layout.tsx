/** Print pages (posters): no app chrome, so what you see is exactly what prints. */
export default function PrintLayout({ children }: LayoutProps<"/">) {
  return <div className="flex flex-1 flex-col items-center bg-muted/40 py-8 print:bg-white print:py-0">{children}</div>;
}
