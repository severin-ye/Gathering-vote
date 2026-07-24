import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activities } from "@/db/schema";
import { getActivityPhase } from "./domain/activity";
import { HttpError } from "./http";

export async function requireActivity(activityId: string) {
  const [activity] = await getDb()
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  if (!activity) throw new HttpError(404, "活动不存在");
  return activity;
}

export function assertManager(activity: { managerUserId: string | null }, userId: string) {
  if (activity.managerUserId !== userId) throw new HttpError(403, "只有活动管理员可以操作");
}

export function assertNominationOpen(activity: {
  nominationEndsAt: Date | null;
  votingEndsAt: Date | null;
}) {
  const phase = getActivityPhase(activity.nominationEndsAt, activity.votingEndsAt);
  if (phase === "voting" || phase === "closed") {
    throw new HttpError(409, "候选征集已经截止");
  }
}
