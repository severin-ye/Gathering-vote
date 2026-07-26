import { expect, test } from "@playwright/test";

const user = { id: "00000000-0000-4000-8000-000000000001", username: "王狗蛋", hasPassword: false };
const activityId = "10000000-0000-4000-8000-000000000001";
const candidates = [
  { id: "20000000-0000-4000-8000-000000000001", name: "火锅", description: "暖和", createdById: user.id, createdByUsername: user.username, createdAt: "2026-07-24T10:00:00Z" },
  { id: "20000000-0000-4000-8000-000000000002", name: "桌游", description: "轻松", createdById: user.id, createdByUsername: user.username, createdAt: "2026-07-24T10:01:00Z" }
];

test("登录页在手机宽度可完整操作且明确提示无密码风险", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: null } }));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /今晚/ })).toBeVisible();
  await expect(page.getByText(/无密码账号可以被任何知道你真名的人登录/)).toBeVisible();
  await expect(page.locator("body")).toHaveScreenshot("login-mobile.png", { animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("注册成功后回到登录状态而不是自动进入活动页", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: null } }));
  let registered = false;
  await page.route("**/api/auth/register", async (route) => {
    const body = await route.request().postDataJSON();
    expect(body).toEqual({ username: "王狗蛋", password: "" });
    registered = true;
    await route.fulfill({
      status: 201,
      json: { user: { ...user, hasPassword: false }, message: "注册成功，请登录" }
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /创建账号/ }).click();
  await page.getByLabel("用户名").fill("王狗蛋");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByText("注册成功，请使用刚才的用户名登录。")).toBeVisible();
  await expect(page.getByRole("button", { name: /登录并入席/ })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(registered).toBe(true);
});

test("用户可以进入活动、用按钮排序并保存唯一选票", async ({ page }) => {
  let savedOrder: string[] = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/activities", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      json: {
        activities: [{
          id: activityId,
          title: "周六吃什么",
          description: "预算 100 元",
          eventDate: "2026-08-06",
          managerUserId: user.id,
          managerUsername: user.username,
          nominationEndsAt: "2026-07-24T10:00:00Z",
          votingEndsAt: "2099-07-25T10:00:00Z",
          candidateCount: 2
        }]
      }
    });
  });
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId,
        title: "周六吃什么",
        description: "预算 100 元",
        eventDate: "2026-08-06",
        managerUserId: user.id,
        managerUsername: user.username,
        nominationEndsAt: "2026-07-24T10:00:00Z",
        votingEndsAt: "2099-07-25T10:00:00Z",
        phase: "voting",
        updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates,
      ownBallot: savedOrder,
      results: [
        { candidateId: candidates[1].id, score: 3, rankCounts: [2, 0] },
        { candidateId: candidates[0].id, score: 1, rankCounts: [0, 2] }
      ],
      voterCount: 2
    }
  }));
  await page.route(`**/api/activities/${activityId}/ballot`, async (route) => {
    savedOrder = (await route.request().postDataJSON()).candidateIds;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /周六吃什么/ }).click();
  await expect(page.getByRole("heading", { name: /拖拽我的排序/ })).toBeVisible();
  const dragHandle = page.getByRole("button", { name: "拖动 火锅" });
  await expect(dragHandle).toBeVisible();
  await expect(page.locator(".sortable").first()).toHaveCSS("touch-action", "pan-y");
  await expect(dragHandle).toHaveCSS("touch-action", "none");
  await page.getByRole("button", { name: "火锅 下移" }).click();
  await page.getByRole("button", { name: /保存我的排序/ }).click();
  await expect(page.getByText("已保存这份排序 ✓")).toBeVisible();
  expect(savedOrder).toEqual([candidates[1].id, candidates[0].id]);
  const liveRanking = page.getByRole("region", { name: "当前大家的排序" });
  await expect(liveRanking).toBeVisible();
  await expect(liveRanking.getByText("桌游")).toBeVisible();
  await expect(liveRanking.getByText("3 分")).toBeVisible();
  await expect(liveRanking.locator(".tally-bar-fill").first()).toHaveAttribute("style", /100%/);

  await page.reload();
  await expect(page.getByText("已保存这份排序 ✓")).toBeVisible();
  await page.getByRole("button", { name: "桌游 下移" }).click();
  await expect(page.getByText("已保存这份排序 ✓")).toHaveCount(0);
});

test("参加后才能添加候选和排序，并区分已排序与未排序人员", async ({ page }) => {
  const friend = {
    id: "00000000-0000-4000-8000-000000000002",
    username: "朋友甲"
  };
  let joined = false;
  let friendNote = "桌游高手";
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId, title: "周六吃什么", description: "", eventDate: "2026-08-06",
        managerUserId: friend.id, managerUsername: friend.username, managerDisplayName: `${friendNote}（${friend.username}）`,
        nominationEndsAt: "2099-07-24T10:00:00Z", votingEndsAt: "2099-07-25T10:00:00Z",
        phase: "nomination", updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates,
      ownBallot: [],
      results: [],
      voterCount: 1,
      isParticipant: joined,
      participants: [
        { userId: friend.id, username: friend.username, displayName: `${friendNote}（${friend.username}）`, note: friendNote, hasBallot: true },
        ...(joined ? [{ userId: user.id, username: user.username, hasBallot: false }] : [])
      ]
    }
  }));
  await page.route(`**/api/activities/${activityId}/participants`, async (route) => {
    joined = true;
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route(`**/api/users/${friend.id}/note`, async (route) => {
    friendNote = (await route.request().postDataJSON()).note;
    await route.fulfill({ json: { ok: true, note: friendNote } });
  });

  await page.goto(`/activities/${activityId}`);
  const roster = page.getByRole("region", { name: "参加与排序状态" });
  await expect(roster.getByText(`桌游高手（${friend.username}）`)).toBeVisible();
  await expect(page.locator(".hero")).toContainText(`桌游高手（${friend.username}）`);
  await expect(roster.getByText("已排序", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "添加候选项" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存我的排序" })).toHaveCount(0);

  const joinButton = page.getByRole("button", { name: "参加活动" });
  await expect(page.locator(".hero")).toContainText("参加活动");
  await expect(page.getByRole("region", { name: "当前大家的排序" })).toContainText("参加与排序状态");
  await joinButton.click();
  await expect(roster.getByText(user.username)).toBeVisible();
  await expect(roster.getByText("未排序", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "添加候选项" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存我的排序" })).toBeVisible();
  await page.getByRole("button", { name: `备注 ${friend.username}` }).click();
  const noteDialog = page.getByRole("dialog");
  await noteDialog.getByLabel("我的备注").fill("老甲");
  await noteDialog.getByRole("button", { name: "保存备注" }).click();
  await expect(roster.getByText(`老甲（${friend.username}）`)).toBeVisible();
  await expect(page.locator(".hero")).toContainText(`老甲（${friend.username}）`);
});

test("时间建议只提示，管理员仍可确认保存", async ({ page }) => {
  let savedDeadlines: { nominationEndsAt: string; votingEndsAt: string } | null = null;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId, title: "周六吃什么", description: "", eventDate: "2026-08-06",
        managerUserId: user.id, managerUsername: user.username, nominationEndsAt: null,
        votingEndsAt: null, phase: "setup", updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates: [], ownBallot: [], results: null, voteTimes: [], voterCount: 0,
      participants: [], isParticipant: true
    }
  }));
  await page.route(`**/api/activities/${activityId}/deadlines`, async (route) => {
    savedDeadlines = await route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto(`/activities/${activityId}`);
  await expect(page.getByLabel("候选截止")).toHaveAttribute("min", /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  await expect(page.getByLabel("排序截止")).toHaveAttribute("min", /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  await page.getByLabel("候选截止").fill("2026-08-05T21:00");
  await page.getByLabel("排序截止").fill("2026-08-06T01:00");
  await page.getByRole("button", { name: "保存时间" }).click();

  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText("问题 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("问题 2", { exact: true })).toBeVisible();
  await expect(dialog.getByText("问题 3", { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText("排序截止日期最好至少比活动日期早一天");
  await expect(dialog).toContainText("至少比排序截止时间早 6 小时");
  await dialog.getByRole("button", { name: "再想想" }).click();
  await expect(dialog).toHaveCount(0);
  expect(savedDeadlines).toBeNull();

  await page.getByRole("button", { name: "保存时间" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "确定保存" }).click();
  await expect.poll(() => savedDeadlines).not.toBeNull();
});

test("添加候选成功后安全清空表单，不触发 reset 空引用", async ({ page }) => {
  let saved = false;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId,
        title: "2026年8月6日",
        description: "",
        eventDate: "2026-08-06",
        managerUserId: user.id,
        managerUsername: user.username,
        nominationEndsAt: "2099-07-24T10:00:00Z",
        votingEndsAt: "2099-07-25T10:00:00Z",
        phase: "nomination",
        updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates: saved ? [{
        id: candidates[0].id,
        name: "看电影",
        description: "",
        createdById: user.id,
        createdByUsername: user.username,
        createdAt: "2026-07-24T10:00:00Z"
      }] : [],
      ownBallot: [],
      results: null,
      voterCount: 0
    }
  }));
  await page.route(`**/api/activities/${activityId}/candidates`, async (route) => {
    saved = true;
    await route.fulfill({ status: 201, json: { candidate: { id: candidates[0].id } } });
  });
  await page.goto(`/activities/${activityId}`);
  const nameInput = page.getByLabel("候选名称");
  await nameInput.fill("看电影");
  await page.getByRole("button", { name: "加入清单" }).click();
  await expect(nameInput).toHaveValue("");
  await expect(page.getByText("看电影", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "拖动 看电影" })).toBeVisible();
});

test("参加者可以添加活动时间并保存多选时间票", async ({ page }) => {
  const optionId = "20000000-0000-4000-8000-000000000001";
  let timeOptions: Array<Record<string, unknown>> = [];
  let optionBody: Record<string, unknown> | null = null;
  let voteBody: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId, title: "周六吃什么", description: "", eventDate: "2026-08-06",
        managerUserId: user.id, managerUsername: user.username,
        nominationEndsAt: null, votingEndsAt: null, phase: "setup",
        updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates: [], ownBallot: [], results: null, voterCount: 0,
      participants: [{ userId: user.id, username: user.username, hasBallot: false }],
      isParticipant: true,
      timeOptions,
      ownTimeOptionIds: voteBody ? [optionId] : [],
      timeResults: timeOptions.map((option) => ({ ...option, optionId: option.id, votes: voteBody ? 1 : 0 }))
    }
  }));
  await page.route(`**/api/activities/${activityId}/time-options`, async (route) => {
    optionBody = await route.request().postDataJSON();
    timeOptions = [{
      id: optionId, kind: "arrival", hour: 9, minute: 30, createdById: user.id,
      createdAt: "2026-07-24T10:00:00Z"
    }];
    await route.fulfill({ status: 201, json: { option: timeOptions[0] } });
  });
  await page.route(`**/api/activities/${activityId}/time-vote`, async (route) => {
    voteBody = await route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto(`/activities/${activityId}`);
  await page.getByRole("button", { name: "添加新的时间" }).click();
  await page.getByRole("button", { name: "进场时间" }).click();
  await page.getByRole("button", { name: "上午" }).click();
  await expect(page.locator(".time-hour-grid button")).toHaveCount(12);
  await page.getByRole("button", { name: "9点" }).click();
  await page.getByLabel("分钟（可不选）").fill("30");
  await page.getByRole("button", { name: "保存这个时间" }).click();
  expect(optionBody).toEqual({ kind: "arrival", hour: 9, minute: 30 });
  await page.getByLabel("进场 09:30").check();
  await page.getByRole("button", { name: "保存我的时间选择" }).click();
  expect(voteBody).toEqual({ optionIds: [optionId] });
  await expect(page.getByText("已保存时间选择 ✓")).toBeVisible();
});

test("截止后的第一名显示皇冠并重点加粗", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId,
        title: "周六吃什么",
        description: "",
        eventDate: "2026-08-06",
        managerUserId: user.id,
        managerUsername: user.username,
        nominationEndsAt: "2026-07-24T10:00:00Z",
        votingEndsAt: "2026-07-25T10:00:00Z",
        phase: "closed",
        updatedAt: "2026-07-25T10:00:00Z"
      },
      candidates,
      ownBallot: candidates.map((candidate) => candidate.id),
      results: [
        { candidateId: candidates[0].id, score: 2, rankCounts: [2, 0] },
        { candidateId: candidates[1].id, score: 0, rankCounts: [0, 2] }
      ],
      timeOptions: [
        { id: "20000000-0000-4000-8000-000000000001", kind: "arrival", hour: 10, minute: 30, createdById: user.id },
        { id: "20000000-0000-4000-8000-000000000002", kind: "departure", hour: 20, minute: 0, createdById: user.id }
      ],
      ownTimeOptionIds: [],
      timeResults: [
        { optionId: "20000000-0000-4000-8000-000000000001", kind: "arrival", hour: 10, minute: 30, votes: 2 },
        { optionId: "20000000-0000-4000-8000-000000000002", kind: "departure", hour: 20, minute: 0, votes: 3 }
      ],
      participants: [
        { userId: user.id, username: user.username, hasBallot: true },
        { userId: "00000000-0000-4000-8000-000000000002", username: "朋友甲", hasBallot: true },
        { userId: "00000000-0000-4000-8000-000000000003", username: "朋友乙", hasBallot: true },
        { userId: "00000000-0000-4000-8000-000000000004", username: "朋友丙", hasBallot: false }
      ],
      voterCount: 3
    }
  }));

  await page.goto(`/activities/${activityId}`);
  const winner = page.locator(".result-row.winner");
  await expect(winner).toContainText("火锅");
  await expect(winner.getByLabel("冠军")).toBeVisible();
  await expect(winner.locator(".winner-name")).toHaveCSS("font-weight", "900");
  const arrivalCurve = page.getByRole("region", { name: "进场时间结果" });
  const departureCurve = page.getByRole("region", { name: "离场时间结果" });
  await expect(arrivalCurve.getByLabel("10:30，2人，50%")).toBeVisible();
  await expect(departureCurve.getByLabel("20:00，3人，75%")).toBeVisible();
});

test("账号管理可以修改用户名并为无密码用户设置密码", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/activities", (route) => route.fulfill({ json: { activities: [] } }));
  let passwordBody: Record<string, string> | null = null;
  await page.route("**/api/auth/account", async (route) => {
    passwordBody = await route.request().postDataJSON();
    await route.fulfill({ json: { user: { ...user, username: "王小蛋", hasPassword: true } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "账号管理" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("设置密码后，其他人不能再只凭你的用户名登录。")).toBeVisible();
  await expect(dialog.getByLabel("原密码")).toHaveCount(0);
  await dialog.getByLabel("用户名").fill("王小蛋");
  await dialog.getByLabel("新密码", { exact: true }).fill("new-pass");
  await dialog.getByLabel("再次输入新密码").fill("new-pass");
  await dialog.getByRole("button", { name: "保存账号设置", exact: true }).click();
  expect(passwordBody).toEqual({
    username: "王小蛋",
    currentPassword: "",
    newPassword: "new-pass",
    confirmPassword: "new-pass"
  });
  await page.getByRole("button", { name: "账号管理" }).click();
  await expect(page.getByRole("dialog").getByLabel("用户名")).toHaveValue("王小蛋");
  await expect(page.getByRole("dialog").getByLabel("原密码")).toBeVisible();
});

test("新建活动名称可留空，并随请求发送日期和幂等键", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  let requestBody: Record<string, string> | null = null;
  await page.route("**/api/activities", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { activities: [] } });
    }
    requestBody = await route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: {
        activity: {
          id: activityId,
          title: "2026年8月6日",
          eventDate: "2026-08-06"
        }
      }
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "发起一场聚会" }).click();
  await page.getByLabel("聚会日期").fill("2026-08-06");
  await page.getByRole("button", { name: "创建选票" }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${activityId}$`));
  const submitted = requestBody as unknown as Record<string, string>;
  expect(submitted.title).toBe("");
  expect(submitted.eventDate).toBe("2026-08-06");
  expect(submitted.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
});

test("只有活动管理员能确认删除当前活动", async ({ page }) => {
  let deleted = false;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        activity: {
          id: activityId, title: "周六吃什么", description: "", eventDate: "2026-08-06",
          managerUserId: user.id, managerUsername: user.username, nominationEndsAt: null,
          votingEndsAt: null, phase: "setup", updatedAt: "2026-07-24T10:00:00Z"
        },
        candidates: [], ownBallot: [], results: null, voteTimes: [], voterCount: 0,
        participants: [], isParticipant: true
      }
    });
  });

  await page.goto(`/activities/${activityId}`);
  await page.getByRole("button", { name: "删除这个活动" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("只删除这一场活动");
  await dialog.getByLabel("输入“删除这个活动”").fill("删除这个活动");
  await Promise.all([
    page.waitForURL("**/"),
    dialog.getByRole("button", { name: "确认删除" }).click()
  ]);
  expect(deleted).toBe(true);
});

test("非管理员看不到删除活动入口", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route(`**/api/activities/${activityId}`, (route) => route.fulfill({
    json: {
      activity: {
        id: activityId, title: "周六吃什么", description: "", eventDate: "2026-08-06",
        managerUserId: "00000000-0000-4000-8000-000000000099", managerUsername: "朋友甲",
        nominationEndsAt: null, votingEndsAt: null, phase: "setup", updatedAt: "2026-07-24T10:00:00Z"
      },
      candidates: [], ownBallot: [], results: null, voteTimes: [], voterCount: 0,
      participants: [], isParticipant: true
    }
  }));

  await page.goto(`/activities/${activityId}`);
  await expect(page.getByRole("button", { name: "删除这个活动" })).toHaveCount(0);
});
