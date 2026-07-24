import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activities } from "@/db/schema";
import { assertManager, requireActivity } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { apiError, assertSameOrigin, parseJson } from "@/lib/http";
import { activityDeadlinesSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    assertManager(activity, user.id);
    const input = await parseJson(request, activityDeadlinesSchema);
    const [updated] = await getDb()
      .update(activities)
      .set({
        nominationEndsAt: new Date(input.nominationEndsAt),
        votingEndsAt: new Date(input.votingEndsAt),
        updatedAt: new Date()
      })
      .where(eq(activities.id, id))
      .returning();
    return NextResponse.json({ activity: updated });
  } catch (error) {
    return apiError(error);
  }
}
