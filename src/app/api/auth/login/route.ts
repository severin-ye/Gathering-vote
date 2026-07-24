import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-credentials";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { credentialsSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "login", 10);
    const input = await parseJson(request, credentialsSchema);
    const [user] = await getDb()
      .select()
      .from(users)
      .where(eq(users.usernameKey, normalizeName(input.username)))
      .limit(1);
    if (!user) throw new HttpError(401, "用户名或密码不正确");
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "用户名或密码不正确");
    }
    await createSession(user.id);
    return NextResponse.json({
      user: { id: user.id, username: user.username, hasPassword: Boolean(user.passwordHash) }
    });
  } catch (error) {
    return apiError(error);
  }
}
