import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities, activityParticipants, ballotItems, ballots, candidates, userNotes, users } from "@/db/schema";
import { requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { getActivityPhase } from "@/lib/domain/activity";
import { calculateBordaResults } from "@/lib/domain/voting";
import { apiError, assertSameOrigin, HttpError, parseJson, rateLimit } from "@/lib/http";
import { deleteActivitySchema } from "@/lib/validation";

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
    const grouped = new Map<string, string[]>();
    for (const row of ownBallotRows) {
      const list = grouped.get(row.userId) ?? [];
      list.push(row.candidateId);
      grouped.set(row.userId, list);
    }
    const completedBallots = [...grouped.entries()]
      .filter(([, ranking]) => candidateRows.length > 0 && ranking.length === candidateRows.length);
    const sortedUserIds = new Set(completedBallots.map(([userId]) => userId));
    const voterCount = completedBallots.length;
    const results = calculateBordaResults(
      candidateRows,
      completedBallots.map(([, ranking]) => ranking)
    );

    const participantRows = await getDb()
      .select({
        userId: activityParticipants.userId,
        username: users.username
      })
      .from(activityParticipants)
      .innerJoin(users, eq(activityParticipants.userId, users.id))
      .where(eq(activityParticipants.activityId, id))
      .orderBy(asc(activityParticipants.joinedAt));
    const noteRows = await getDb()
      .select({
        targetUserId: userNotes.targetUserId,
        note: userNotes.note
      })
      .from(userNotes)
      .where(eq(userNotes.ownerUserId, user.id));
    const notes = new Map(noteRows.map((row) => [row.targetUserId, row.note]));
    const participants = participantRows.map((participant) => ({
      ...participant,
      note: notes.get(participant.userId) ?? "",
      displayName: observedName(participant.username, notes.get(participant.userId)),
      hasBallot: sortedUserIds.has(participant.userId)
    }));

    return NextResponse.json({
      activity: {
        ...header,
        managerDisplayName: header.managerUsername
          ? observedName(header.managerUsername, header.managerUserId ? notes.get(header.managerUserId) : undefined)
          : null,
        phase
      },
      candidates: candidateRows.map((candidate) => ({
        ...candidate,
        createdByDisplayName: observedName(
          candidate.createdByUsername,
          notes.get(candidate.createdById)
        )
      })),
      ownBallot,
      results,
      voterCount,
      participants,
      isParticipant: participants.some((participant) => participant.userId === user.id)
    });
  } catch (error) {
    return apiError(error);
  }
}

function observedName(username: string, note?: string) {
  return note ? `${note}（${username}）` : username;
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "delete-activity", 6, 10 * 60_000);
    const user = await requireUser();
    const { id } = await context.params;
    await parseJson(request, deleteActivitySchema);

    const [deleted] = await getDb()
      .delete(activities)
      .where(and(eq(activities.id, id), eq(activities.managerUserId, user.id)))
      .returning({ id: activities.id });
    if (deleted) return NextResponse.json({ ok: true, deletedActivityId: deleted.id });

    const [existing] = await getDb()
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.id, id))
      .limit(1);
    if (!existing) throw new HttpError(404, "活动不存在");
    throw new HttpError(403, "只有这场活动的管理员可以删除它");
  } catch (error) {
    return apiError(error);
  }
}
