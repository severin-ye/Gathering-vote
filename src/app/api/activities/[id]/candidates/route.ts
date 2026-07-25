import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { candidates } from "@/db/schema";
import { assertNominationOpen, requireActivity, requireParticipant } from "@/lib/activity-access";
import { requireUser } from "@/lib/auth";
import { normalizeName } from "@/lib/domain/normalization";
import { apiError, assertSameOrigin, parseJson } from "@/lib/http";
import { candidateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const activity = await requireActivity(id);
    assertNominationOpen(activity);
    await requireParticipant(id, user.id);
    const input = await parseJson(request, candidateSchema);
    const [candidate] = await getDb()
      .insert(candidates)
      .values({
        activityId: id,
        name: input.name,
        nameKey: normalizeName(input.name),
        description: input.description,
        createdById: user.id
      })
      .returning();
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
