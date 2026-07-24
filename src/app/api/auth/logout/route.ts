import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
