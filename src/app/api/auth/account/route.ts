import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth-credentials";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { accountUpdateSchema } from "@/lib/validation";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "account", 8, 10 * 60_000);
    const user = await requireUser();
    const input = await parseJson(request, accountUpdateSchema);
    if (user.passwordHash && !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new HttpError(401, "原密码不正确");
    }

    const username = input.username.trim().replace(/\s+/g, " ");
    const passwordHash = input.newPassword
      ? await hashPassword(input.newPassword)
      : user.passwordHash;
    const [updated] = await getDb()
      .update(users)
      .set({
        username,
        usernameKey: normalizeName(username),
        passwordHash
      })
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        hasPassword: Boolean(updated.passwordHash)
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
