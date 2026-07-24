import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { candidates } from "@/db/schema";
import { assertNominationOpen, requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, HttpError, parseJson } from "@/lib/http";
import { candidateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string; candidateId: string }> };

async function getEditableCandidate(id: string, candidateId: string, userId: string) {
  const activity = await requireActivity(id);
  assertNominationOpen(activity);
  const [candidate] = await getDb()
    .select()
    .from(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.activityId, id)))
    .limit(1);
  if (!candidate) throw new HttpError(404, "候选项不存在");
  if (candidate.createdById !== userId && activity.managerUserId !== userId) {
    throw new HttpError(403, "只能管理自己添加的候选项");
  }
  return candidate;
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id, candidateId } = await context.params;
    await getEditableCandidate(id, candidateId, user.id);
    const input = await parseJson(request, candidateSchema);
    const [candidate] = await getDb()
      .update(candidates)
      .set({ name: input.name, nameKey: normalizeName(input.name), description: input.description })
      .where(eq(candidates.id, candidateId))
      .returning();
    return NextResponse.json({ candidate });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id, candidateId } = await context.params;
    await getEditableCandidate(id, candidateId, user.id);
    await getDb().delete(candidates).where(eq(candidates.id, candidateId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
