export type ActivityPhase = "setup" | "nomination" | "voting" | "closed";

export function getActivityPhase(
  nominationEndsAt: Date | null,
  votingEndsAt: Date | null,
  now = new Date()
): ActivityPhase {
  if (!nominationEndsAt || !votingEndsAt) return "setup";
  if (now < nominationEndsAt) return "nomination";
  if (now < votingEndsAt) return "voting";
  return "closed";
}

export const phaseLabels: Record<ActivityPhase, string> = {
  setup: "待设置",
  nomination: "征集中",
  voting: "排序中",
  closed: "已结束"
};

export function formatActivityTitle(eventDate: string): string {
  const [year, month, day] = eventDate.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
