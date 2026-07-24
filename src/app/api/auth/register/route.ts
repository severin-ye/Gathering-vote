import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth-credentials";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, parseJson, rateLimit } from "@/lib/http";
import { registrationCredentialsSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "register", 8);
    const input = await parseJson(request, registrationCredentialsSchema);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const [user] = await getDb()
      .insert(users)
      .values({
        username: input.username.trim().replace(/\s+/g, " "),
        usernameKey: normalizeName(input.username),
        passwordHash
      })
      .returning();
    return NextResponse.json(
      {
        user: { id: user.id, username: user.username, hasPassword: Boolean(user.passwordHash) },
        message: "注册成功，请登录"
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
