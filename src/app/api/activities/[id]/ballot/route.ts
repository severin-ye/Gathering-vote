import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { ballotItems, ballots, candidates } from "@/db/schema";
import { requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { getActivityPhase } from "@/lib/domain/activity";
import { validateRanking } from "@/lib/domain/voting";
import { apiError, assertSameOrigin, HttpError, parseJson } from "@/lib/http";
import { ballotSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    if (getActivityPhase(activity.nominationEndsAt, activity.votingEndsAt) === "closed") {
      throw new HttpError(409, "排序投票已经结束");
    }
    const input = await parseJson(request, ballotSchema);
    const activityCandidates = await getDb()
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.activityId, id));
    const validation = validateRanking(
      input.candidateIds,
      activityCandidates.map((candidate) => candidate.id)
    );
    if (!validation.ok) throw new HttpError(400, validation.reason);

    await getDb().transaction(async (tx) => {
      const [ballot] = await tx
        .insert(ballots)
        .values({ activityId: id, userId: user.id })
        .onConflictDoUpdate({
          target: [ballots.activityId, ballots.userId],
          set: { updatedAt: new Date() }
        })
        .returning();
      await tx.delete(ballotItems).where(eq(ballotItems.ballotId, ballot.id));
      if (input.candidateIds.length) {
        await tx.insert(ballotItems).values(
          input.candidateIds.map((candidateId, position) => ({
            ballotId: ballot.id,
            candidateId,
            position
          }))
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
