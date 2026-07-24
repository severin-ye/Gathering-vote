import { describe, expect, it } from "vitest";
import {
  activityDeadlinesSchema,
  activitySchema,
  ballotSchema,
  clearActivitiesSchema,
  credentialsSchema,
  passwordChangeSchema,
  registrationCredentialsSchema
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

  it("requires voting to end after nominations", () => {
    const invalid = activityDeadlinesSchema.safeParse({
      nominationEndsAt: "2026-07-25T12:00:00.000Z",
      votingEndsAt: "2026-07-25T11:00:00.000Z"
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects duplicate ballot candidate ids", () => {
    expect(ballotSchema.safeParse({ candidateIds: ["a", "a"] }).success).toBe(false);
  });

  it("requires both destructive confirmation values", () => {
    expect(
      clearActivitiesSchema.safeParse({
        username: "王狗蛋",
        confirmation: "清空所有活动"
      }).success
    ).toBe(true);
    expect(
      clearActivitiesSchema.safeParse({
        username: "王狗蛋",
        confirmation: "清空活动"
      }).success
    ).toBe(false);
  });
});
