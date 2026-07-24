import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-credentials";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/validation";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "password", 8, 10 * 60_000);
    const user = await requireUser();
    const input = await parseJson(request, passwordChangeSchema);
    if (user.passwordHash && !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new HttpError(401, "原密码不正确");
    }
    const passwordHash = await hashPassword(input.newPassword);
    await getDb().update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return NextResponse.json({ ok: true, hasPassword: true });
  } catch (error) {
    return apiError(error);
  }
}
