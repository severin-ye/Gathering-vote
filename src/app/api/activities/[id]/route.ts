import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities, ballotItems, ballots, candidates, users } from "@/db/schema";
import { requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { getActivityPhase } from "@/lib/domain/activity";
import { calculateBordaResults } from "@/lib/domain/voting";
import { apiError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    const managers = alias(users, "managers");
    const [header] = await getDb()
      .select({
        id: activities.id,
        title: activities.title,
        description: activities.description,
        eventDate: activities.eventDate,
        managerUserId: activities.managerUserId,
        managerUsername: managers.username,
        nominationEndsAt: activities.nominationEndsAt,
        votingEndsAt: activities.votingEndsAt,
        createdAt: activities.createdAt,
        updatedAt: activities.updatedAt
      })
      .from(activities)
      .leftJoin(managers, eq(activities.managerUserId, managers.id))
      .where(eq(activities.id, id))
      .limit(1);
    const creators = alias(users, "creators");
    const candidateRows = await getDb()
      .select({
        id: candidates.id,
        name: candidates.name,
        description: candidates.description,
        createdById: candidates.createdById,
        createdByUsername: creators.username,
        createdAt: candidates.createdAt
      })
      .from(candidates)
      .innerJoin(creators, eq(candidates.createdById, creators.id))
      .where(eq(candidates.activityId, id))
      .orderBy(asc(candidates.createdAt));

    const ownBallotRows = await getDb()
      .select({ candidateId: ballotItems.candidateId, userId: ballots.userId })
      .from(ballots)
      .innerJoin(ballotItems, eq(ballots.id, ballotItems.ballotId))
      .where(eq(ballots.activityId, id))
      .orderBy(asc(ballotItems.position));
    const ownBallot = ownBallotRows
      .filter((row) => row.userId === user.id)
      .map((row) => row.candidateId);

    const phase = getActivityPhase(activity.nominationEndsAt, activity.votingEndsAt);
    let results: ReturnType<typeof calculateBordaResults> | null = null;
    let voterCount = 0;
    if (phase === "closed") {
      const grouped = new Map<string, string[]>();
      for (const row of ownBallotRows) {
        const list = grouped.get(row.userId) ?? [];
        list.push(row.candidateId);
        grouped.set(row.userId, list);
      }
      voterCount = grouped.size;
      results = calculateBordaResults(candidateRows, [...grouped.values()]);
    }

    return NextResponse.json({
      activity: { ...header, phase },
      candidates: candidateRows,
      ownBallot,
      results,
      voterCount
    });
  } catch (error) {
    return apiError(error);
  }
}
