"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      Print (A4)
    </Button>
  );
}
