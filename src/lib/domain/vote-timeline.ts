export type VoteTimeSort = "chronological" | "votes";
export type TimeOptionKind = "arrival" | "departure";

export interface TimeVoteResult {
  optionId: string;
  kind: TimeOptionKind;
  hour: number;
  minute: number;
  votes: number;
}

export interface TimeCurvePoint extends TimeVoteResult {
  label: string;
  percentage: number;
}

export function buildTimeCurvePoints(
  results: TimeVoteResult[],
  kind: TimeOptionKind,
  participantCount: number
): TimeCurvePoint[] {
  return results
    .filter((result) => result.kind === kind && result.votes > 0)
    .map((result) => ({
      ...result,
      label: formatTimeOption(result.hour, result.minute),
      percentage: participantCount > 0
        ? Math.round((result.votes / participantCount) * 100)
        : 0
    }))
    .sort((left, right) => timeValue(left) - timeValue(right));
}

export function formatTimeOption(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeValue(value: Pick<TimeVoteResult, "hour" | "minute">) {
  return value.hour * 60 + value.minute;
}
