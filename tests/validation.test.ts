import { describe, expect, it } from "vitest";
import {
  accountUpdateSchema,
  activityDeadlinesSchema,
  activitySchema,
  ballotSchema,
  credentialsSchema,
  deleteActivitySchema,
  passwordChangeSchema,
  registrationCredentialsSchema,
  timeOptionSchema,
  timeVoteSchema,
  userNoteSchema
} from "@/lib/validation";
import { formatActivityTitle } from "@/lib/domain/activity";

describe("request validation", () => {
  it("allows an optional activity name and derives a Chinese date title", () => {
    const parsed = activitySchema.parse({
      title: "",
      eventDate: "2026-08-06",
      description: "",
      clientRequestId: "30000000-0000-4000-8000-000000000001"
    });
    expect(parsed.title).toBe("");
    expect(formatActivityTitle(parsed.eventDate)).toBe("2026年8月6日");
    expect(activitySchema.safeParse({ title: "", eventDate: "" }).success).toBe(false);
  });

  it("accepts a real name with an optional password", () => {
    expect(credentialsSchema.parse({ username: "王狗蛋", password: "" })).toEqual({
      username: "王狗蛋",
      password: ""
    });
    expect(credentialsSchema.safeParse({ username: "A", password: "" }).success).toBe(false);
    expect(registrationCredentialsSchema.safeParse({ username: "王狗蛋", password: "123" }).success).toBe(false);
    expect(registrationCredentialsSchema.safeParse({ username: "王狗蛋", password: "" }).success).toBe(true);
  });

  it("requires a six-character new password and matching confirmation", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "",
        newPassword: "new-pass",
        confirmPassword: "new-pass"
      }).success
    ).toBe(true);
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "",
        newPassword: "123",
        confirmPassword: "123"
      }).success
    ).toBe(false);
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "old-pass",
        newPassword: "new-pass",
        confirmPassword: "different"
      }).success
    ).toBe(false);
  });

  it("allows renaming an account and validates private notes", () => {
    expect(
      accountUpdateSchema.safeParse({
        username: "王小蛋",
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }).success
    ).toBe(true);
    expect(userNoteSchema.parse({ note: "桌游高手" })).toEqual({ note: "桌游高手" });
    expect(userNoteSchema.safeParse({ note: "a".repeat(41) }).success).toBe(false);
  });

  it("requires voting to end after nominations", () => {
    const invalid = activityDeadlinesSchema.safeParse({
      nominationEndsAt: "2026-07-25T12:00:00.000Z",
      votingEndsAt: "2026-07-25T11:00:00.000Z"
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects nomination and voting deadlines in the past", () => {
    const past = activityDeadlinesSchema.safeParse({
      nominationEndsAt: "2000-01-01T10:00:00.000Z",
      votingEndsAt: "2000-01-01T16:00:00.000Z"
    });
    expect(past.success).toBe(false);
  });

  it("rejects duplicate ballot candidate ids", () => {
    expect(ballotSchema.safeParse({ candidateIds: ["a", "a"] }).success).toBe(false);
  });

  it("validates a proposed time and a multi-select time vote", () => {
    expect(timeOptionSchema.parse({ kind: "arrival", hour: 9, minute: "" })).toEqual({ kind: "arrival", hour: 9, minute: 0 });
    expect(timeOptionSchema.parse({ kind: "departure", hour: 20, minute: 35 })).toEqual({ kind: "departure", hour: 20, minute: 35 });
    expect(timeOptionSchema.safeParse({ kind: "arrival", hour: 24, minute: 0 }).success).toBe(false);
    expect(timeOptionSchema.safeParse({ kind: "meeting", hour: 9, minute: 0 }).success).toBe(false);
    const optionId = "20000000-0000-4000-8000-000000000001";
    expect(timeVoteSchema.safeParse({ optionIds: [optionId] }).success).toBe(true);
    expect(timeVoteSchema.safeParse({ optionIds: [optionId, optionId] }).success).toBe(false);
  });

  it("requires the exact single-activity deletion confirmation", () => {
    expect(
      deleteActivitySchema.safeParse({ confirmation: "删除这个活动" }).success
    ).toBe(true);
    expect(
      deleteActivitySchema.safeParse({ confirmation: "删除活动" }).success
    ).toBe(false);
  });
});
