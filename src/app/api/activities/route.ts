import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities, candidates, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatActivityTitle } from "@/lib/domain/activity";
import { apiError, assertSameOrigin, parseJson } from "@/lib/http";
import { activitySchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireUser();
    const managers = alias(users, "managers");
    const rows = await getDb()
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
        candidateCount: sql<number>`count(${candidates.id})::int`
      })
      .from(activities)
      .leftJoin(managers, eq(activities.managerUserId, managers.id))
      .leftJoin(candidates, eq(activities.id, candidates.activityId))
      .groupBy(activities.id, managers.id)
      .orderBy(desc(activities.createdAt));
    return NextResponse.json({ activities: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, activitySchema);
    const [created] = await getDb()
      .insert(activities)
      .values({
        title: input.title || formatActivityTitle(input.eventDate),
        eventDate: input.eventDate,
        description: input.description,
        clientRequestId: input.clientRequestId,
        createdById: user.id
      })
      .onConflictDoNothing({ target: activities.clientRequestId })
      .returning();
    const [activity] =
      created
        ? [created]
        : await getDb()
            .select()
            .from(activities)
            .where(eq(activities.clientRequestId, input.clientRequestId))
            .limit(1);
    return NextResponse.json({ activity }, { status: created ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
