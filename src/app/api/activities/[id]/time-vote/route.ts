import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activityTimeOptions, activityTimeVotes } from "@/db/schema";
import { requireActivity, requireParticipant } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { getActivityPhase } from "@/lib/domain/activity";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { timeVoteSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "time-vote", 30, 60_000);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    if (getActivityPhase(activity.nominationEndsAt, activity.votingEndsAt) === "closed") {
      throw new HttpError(409, "时间投票已经结束");
    }
    await requireParticipant(id, user.id);
    const input = await parseJson(request, timeVoteSchema);
    const options = await getDb()
      .select({ id: activityTimeOptions.id })
      .from(activityTimeOptions)
      .where(eq(activityTimeOptions.activityId, id));
    const validIds = new Set(options.map((option) => option.id));
    if (input.optionIds.some((optionId) => !validIds.has(optionId))) {
      throw new HttpError(400, "时间选择包含不属于本活动的选项");
    }

    await getDb().transaction(async (tx) => {
      await tx
        .delete(activityTimeVotes)
        .where(
          and(
            eq(activityTimeVotes.activityId, id),
            eq(activityTimeVotes.userId, user.id)
          )
        );
      if (input.optionIds.length) {
        await tx.insert(activityTimeVotes).values(
          input.optionIds.map((optionId) => ({
            activityId: id,
            optionId,
            userId: user.id
          }))
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
