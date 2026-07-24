import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities, ballots, candidates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { clearActivitiesSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "clear", 3, 10 * 60_000);
    const user = await requireUser();
    const input = await parseJson(request, clearActivitiesSchema);
    if (normalizeName(input.username) !== normalizeName(user.username)) {
      throw new HttpError(400, "输入的用户名与当前账号不一致");
    }
    const [managed] = await getDb()
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.managerUserId, user.id))
      .limit(1);
    if (!managed) throw new HttpError(403, "只有当前活动管理员可以清空活动");

    const [activityCount, candidateCount, ballotCount] = await Promise.all([
      getDb().select({ value: count() }).from(activities),
      getDb().select({ value: count() }).from(candidates),
      getDb().select({ value: count() }).from(ballots)
    ]);
    const counts = {
      activities: activityCount[0]?.value ?? 0,
      candidates: candidateCount[0]?.value ?? 0,
      ballots: ballotCount[0]?.value ?? 0
    };
    await getDb().transaction(async (tx) => {
      await tx.delete(activities);
    });
    return NextResponse.json({ ok: true, deleted: counts });
  } catch (error) {
    return apiError(error);
  }
}
