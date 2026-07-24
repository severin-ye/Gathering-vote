import { describe, expect, it } from "vitest";
import { getActivityPhase } from "@/lib/domain/activity";
import { calculateBordaResults, mergeRankingOrder, validateRanking } from "@/lib/domain/voting";
import { normalizeName } from "@/lib/domain/normalization";

describe("name normalization", () => {
  it("trims, collapses whitespace, and compares case-insensitively", () => {
    expect(normalizeName("  Alice   Zhang ")).toBe("alice zhang");
  });
});

describe("activity phases", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");

  it("stays in setup until both deadlines exist", () => {
    expect(getActivityPhase(null, null, now)).toBe("setup");
  });

  it("uses exact deadline boundaries", () => {
    const nominationEnd = new Date("2026-07-24T12:00:00.000Z");
    const votingEnd = new Date("2026-07-25T12:00:00.000Z");
    expect(getActivityPhase(nominationEnd, votingEnd, now)).toBe("voting");
    expect(getActivityPhase(nominationEnd, votingEnd, votingEnd)).toBe("closed");
  });
});

describe("ranked ballots", () => {
  it("requires every candidate exactly once", () => {
    expect(validateRanking(["a", "b"], ["a", "b"])).toEqual({ ok: true });
    expect(validateRanking(["a"], ["a", "b"]).ok).toBe(false);
    expect(validateRanking(["a", "a"], ["a", "b"]).ok).toBe(false);
    expect(validateRanking(["a", "x"], ["a", "b"]).ok).toBe(false);
  });

  it("preserves an existing order and appends newly added candidates", () => {
    expect(mergeRankingOrder(["b", "a", "deleted"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("calculates Borda points and deterministic tie breaks", () => {
    const candidates = [
      { id: "a", createdAt: new Date("2026-01-01") },
      { id: "b", createdAt: new Date("2026-01-02") },
      { id: "c", createdAt: new Date("2026-01-03") }
    ];
    const result = calculateBordaResults(candidates, [
      ["a", "b", "c"],
      ["b", "a", "c"]
    ]);

    expect(result.map((row) => [row.candidateId, row.score])).toEqual([
      ["a", 3],
      ["b", 3],
      ["c", 0]
    ]);
    expect(result[0].rankCounts).toEqual([1, 1, 0]);
  });

  it("returns stable candidate order when there are no ballots", () => {
    const result = calculateBordaResults(
      [
        { id: "older", createdAt: new Date("2026-01-01") },
        { id: "newer", createdAt: new Date("2026-01-02") }
      ],
      []
    );
    expect(result.map((row) => row.candidateId)).toEqual(["older", "newer"]);
  });
});
