import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities } from "@/db/schema";
import { requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { apiError, assertSameOrigin, HttpError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const [claimed] = await getDb()
      .update(activities)
      .set({ managerUserId: user.id, updatedAt: new Date() })
      .where(and(eq(activities.id, id), isNull(activities.managerUserId)))
      .returning();
    if (!claimed) throw new HttpError(409, "这场活动刚刚已被其他人申领");
    return NextResponse.json({ activity: claimed });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    await requireActivity(id);
    const [released] = await getDb()
      .update(activities)
      .set({ managerUserId: null, updatedAt: new Date() })
      .where(and(eq(activities.id, id), eq(activities.managerUserId, user.id)))
      .returning();
    if (!released) throw new HttpError(403, "只有当前管理员可以解除");
    return NextResponse.json({ activity: released });
  } catch (error) {
    return apiError(error);
  }
}
