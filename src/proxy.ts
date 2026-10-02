import { NextResponse } from "next/server";

/**
 * /dev/* (pages and APIs) is a 404 in production unless DEV_TOOLS=1. The dev layout and each dev
 * route check too; this gate runs before any of them renders (a layout check alone doesn't cover
 * a page requested on its own).
 */
export function proxy() {
  if (process.env.NODE_ENV === "production" && process.env.DEV_TOOLS !== "1") return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: ["/dev/:path*", "/api/dev/:path*"] };
