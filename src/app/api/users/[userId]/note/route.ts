import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { userNotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { userNoteSchema } from "@/lib/validation";

type Context = { params: Promise<{ userId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "user-note", 30, 60_000);
    const owner = await requireUser();
    const { userId: targetUserId } = await context.params;
    if (targetUserId === owner.id) throw new HttpError(400, "不能给自己添加备注");
    const [target] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!target) throw new HttpError(404, "用户不存在");
    const { note } = await parseJson(request, userNoteSchema);

    if (!note) {
      await getDb()
        .delete(userNotes)
        .where(
          and(
            eq(userNotes.ownerUserId, owner.id),
            eq(userNotes.targetUserId, targetUserId)
          )
        );
    } else {
      await getDb()
        .insert(userNotes)
        .values({ ownerUserId: owner.id, targetUserId, note })
        .onConflictDoUpdate({
          target: [userNotes.ownerUserId, userNotes.targetUserId],
          set: { note, updatedAt: new Date() }
        });
    }
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return apiError(error);
  }
}
