import { describe, expect, it } from "vitest";
import { hashPassword, isSessionActive, verifyPassword } from "@/lib/auth-credentials";

describe("credential rules", () => {
  it("hashes passwords and rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword("correct horse", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("treats a null hash as an intentionally passwordless account", async () => {
    await expect(verifyPassword("", null)).resolves.toBe(true);
    await expect(verifyPassword("anything", null)).resolves.toBe(true);
  });

  it("expires a session at the exact boundary", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    expect(isSessionActive(new Date("2026-07-24T12:00:00.001Z"), now)).toBe(true);
    expect(isSessionActive(new Date("2026-07-24T12:00:00.000Z"), now)).toBe(false);
  });
});
