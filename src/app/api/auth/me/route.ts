import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      user: user
        ? { id: user.id, username: user.username, hasPassword: Boolean(user.passwordHash) }
        : null
    });
  } catch (error) {
    return apiError(error);
  }
}
