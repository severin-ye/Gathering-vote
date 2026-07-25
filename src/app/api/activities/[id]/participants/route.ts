import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activityParticipants } from "@/db/schema";
import { requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { getActivityPhase } from "@/lib/domain/activity";
import { apiError, assertSameOrigin, HttpError, rateLimit } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "join-activity", 20, 60_000);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    if (getActivityPhase(activity.nominationEndsAt, activity.votingEndsAt) === "closed") {
      throw new HttpError(409, "活动已经结束");
    }
    await getDb()
      .insert(activityParticipants)
      .values({ activityId: id, userId: user.id })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
