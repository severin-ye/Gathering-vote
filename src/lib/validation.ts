import { z } from "zod";

const text = (label: string, max: number) =>
  z.string().trim().min(2, `${label}至少需要 2 个字符`).max(max, `${label}过长`);

export const credentialsSchema = z.object({
  username: text("真名", 40),
  password: z.string().max(128, "密码过长").default("")
});

export const registrationCredentialsSchema = credentialsSchema.refine(
  ({ password }) => password.length === 0 || password.length >= 6,
  { message: "密码至少需要 6 个字符", path: ["password"] }
);

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().max(128, "原密码过长").default(""),
    newPassword: z.string().min(6, "新密码至少需要 6 个字符").max(128, "新密码过长"),
    confirmPassword: z.string().max(128, "确认密码过长")
  })
  .refine(({ newPassword, confirmPassword }) => newPassword === confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"]
  });

export const activitySchema = z.object({
  title: z.string().trim().max(80, "活动名称过长").default(""),
  eventDate: z.iso.date(),
  description: z.string().trim().max(500, "说明过长").default(""),
  clientRequestId: z.uuid()
});

export const activityDeadlinesSchema = z
  .object({
    nominationEndsAt: z.iso.datetime(),
    votingEndsAt: z.iso.datetime()
  })
  .refine(
    ({ nominationEndsAt }) => new Date(nominationEndsAt).getTime() > Date.now(),
    { message: "候选截止时间必须晚于当前时间", path: ["nominationEndsAt"] }
  )
  .refine(
    ({ votingEndsAt }) => new Date(votingEndsAt).getTime() > Date.now(),
    { message: "排序截止时间必须晚于当前时间", path: ["votingEndsAt"] }
  )
  .refine(
    ({ nominationEndsAt, votingEndsAt }) =>
      new Date(votingEndsAt).getTime() > new Date(nominationEndsAt).getTime(),
    { message: "排序截止时间必须晚于候选截止时间", path: ["votingEndsAt"] }
  );

export const candidateSchema = z.object({
  name: text("候选名称", 100),
  description: z.string().trim().max(500, "说明过长").default("")
});

export const ballotSchema = z
  .object({ candidateIds: z.array(z.uuid()).max(100, "候选项过多") })
  .refine(({ candidateIds }) => new Set(candidateIds).size === candidateIds.length, {
    message: "排序中不能出现重复候选项",
    path: ["candidateIds"]
  });

export const deleteActivitySchema = z.object({
  confirmation: z.literal("删除这个活动")
});
