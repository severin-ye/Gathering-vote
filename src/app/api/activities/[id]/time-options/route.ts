import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { activityTimeOptions } from "@/db/schema";
import { assertNominationOpen, requireActivity, requireParticipant } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { apiError, assertSameOrigin, parseJson, rateLimit } from "@/lib/http";
import { timeOptionSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "time-option", 20, 60_000);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    assertNominationOpen(activity);
    await requireParticipant(id, user.id);
    const input = await parseJson(request, timeOptionSchema);
    const [option] = await getDb()
      .insert(activityTimeOptions)
      .values({
        activityId: id,
        kind: input.kind,
        hour: input.hour,
        minute: input.minute,
        createdById: user.id
      })
      .returning();
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
