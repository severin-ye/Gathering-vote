export type RankingValidation = { ok: true } | { ok: false; reason: string };

export interface ResultCandidate {
  id: string;
  createdAt: Date;
}

export interface BordaResult {
  candidateId: string;
  score: number;
  rankCounts: number[];
}

export function mergeRankingOrder(existingOrder: string[], candidateIds: string[]): string[] {
  const allowed = new Set(candidateIds);
  const preserved = existingOrder.filter((id, index) => allowed.has(id) && existingOrder.indexOf(id) === index);
  const preservedSet = new Set(preserved);
  return [...preserved, ...candidateIds.filter((id) => !preservedSet.has(id))];
}

export function validateRanking(
  rankedCandidateIds: string[],
  activityCandidateIds: string[]
): RankingValidation {
  if (rankedCandidateIds.length !== activityCandidateIds.length) {
    return { ok: false, reason: "请为所有候选项排序" };
  }
  if (new Set(rankedCandidateIds).size !== rankedCandidateIds.length) {
    return { ok: false, reason: "排序中不能出现重复候选项" };
  }
  const allowed = new Set(activityCandidateIds);
  if (rankedCandidateIds.some((id) => !allowed.has(id))) {
    return { ok: false, reason: "排序包含不属于本活动的候选项" };
  }
  return { ok: true };
}

export function calculateBordaResults(
  candidates: ResultCandidate[],
  ballots: string[][]
): BordaResult[] {
  const candidateCount = candidates.length;
  const rows = new Map(
    candidates.map((candidate) => [
      candidate.id,
      {
        candidateId: candidate.id,
        score: 0,
        rankCounts: Array<number>(candidateCount).fill(0),
        createdAt: candidate.createdAt
      }
    ])
  );

  for (const ballot of ballots) {
    ballot.forEach((candidateId, index) => {
      const row = rows.get(candidateId);
      if (!row) return;
      row.score += candidateCount - index - 1;
      row.rankCounts[index] += 1;
    });
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      for (let index = 0; index < candidateCount; index += 1) {
        if (right.rankCounts[index] !== left.rankCounts[index]) {
          return right.rankCounts[index] - left.rankCounts[index];
        }
      }
      return left.createdAt.getTime() - right.createdAt.getTime();
    })
    .map((row) => ({
      candidateId: row.candidateId,
      score: row.score,
      rankCounts: row.rankCounts
    }));
}
