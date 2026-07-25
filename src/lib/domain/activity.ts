export type ActivityPhase = "setup" | "nomination" | "voting" | "closed";
export type DeadlineWarningCode =
  | "nomination-too-soon"
  | "voting-close-to-event"
  | "nomination-gap-short";
export interface DeadlineWarning {
  code: DeadlineWarningCode;
  message: string;
}

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

export function getDeadlineWarnings(
  eventDate: string,
  nominationLocal: string,
  votingLocal: string,
  now = new Date()
): DeadlineWarning[] {
  const warnings: DeadlineWarning[] = [];
  const nominationTime = new Date(nominationLocal).getTime();
  const votingTime = new Date(votingLocal).getTime();

  const nominationLeadTime = nominationTime - now.getTime();
  if (nominationLeadTime > 0 && nominationLeadTime < 2 * 60 * 60_000) {
    warnings.push({
      code: "nomination-too-soon",
      message: "候选添加截止时间距离现在不到 2 小时。"
    });
  }

  const eventDay = calendarDayNumber(eventDate);
  const votingDay = calendarDayNumber(votingLocal.slice(0, 10));
  if (eventDay - votingDay < 1) {
    warnings.push({
      code: "voting-close-to-event",
      message: "排序截止日期最好至少比活动日期早一天。"
    });
  }

  const gap = votingTime - nominationTime;
  if (gap > 0 && gap < 6 * 60 * 60_000) {
    warnings.push({
      code: "nomination-gap-short",
      message: "候选添加截止时间最好至少比排序截止时间早 6 小时。"
    });
  }
  return warnings;
}

export function formatActivityTitle(eventDate: string): string {
  const [year, month, day] = eventDate.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function calendarDayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}
