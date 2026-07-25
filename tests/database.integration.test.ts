import { readFile, readdir } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const ACTIVITY = "10000000-0000-4000-8000-000000000001";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const migration = await readFile(new URL(file, migrationDirectory), "utf8");
    await db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }
  await db.exec(`
    insert into users (id, username, username_key) values
      ('${USER_A}', '王狗蛋', '王狗蛋'),
      ('${USER_B}', '朋友甲', '朋友甲');
    insert into activities (id, title, created_by_id)
      values ('${ACTIVITY}', '周末聚会', '${USER_A}');
  `);
});

describe("PostgreSQL constraints and transactions", () => {
  it("backfills existing ballot owners into the participant pool without changing ballots", async () => {
    const legacyDb = new PGlite();
    for (const file of ["0000_initial.sql", "0001_activity_date_idempotency.sql"]) {
      const migration = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
      await legacyDb.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    await legacyDb.exec(`
      insert into users (id, username, username_key) values ('${USER_A}', '王狗蛋', '王狗蛋');
      insert into activities (id, title, created_by_id) values ('${ACTIVITY}', '进行中的活动', '${USER_A}');
      insert into candidates (activity_id, name, name_key, created_by_id) values ('${ACTIVITY}', '火锅', '火锅', '${USER_A}');
      insert into ballots (activity_id, user_id) values ('${ACTIVITY}', '${USER_A}');
      insert into ballot_items (ballot_id, candidate_id, position)
        select ballots.id, candidates.id, 0 from ballots, candidates
        where ballots.activity_id = '${ACTIVITY}' and candidates.activity_id = '${ACTIVITY}';
    `);

    const migration = await readFile(new URL("../drizzle/0002_activity_participants.sql", import.meta.url), "utf8");
    await legacyDb.exec(migration.replaceAll("--> statement-breakpoint", ""));

    const state = await legacyDb.query<{ participants: number; ballots: number; ballotItems: number }>(`
      select
        (select count(*)::int from activity_participants) participants,
        (select count(*)::int from ballots) ballots,
        (select count(*)::int from ballot_items) "ballotItems"
    `);
    expect(state.rows[0]).toEqual({ participants: 1, ballots: 1, ballotItems: 1 });
  });

  it("allows exactly one atomic manager claim", async () => {
    const claim = (userId: string) =>
      db.query(
        `update activities set manager_user_id = $1 where id = $2 and manager_user_id is null returning manager_user_id`,
        [userId, ACTIVITY]
      );
    const attempts = await Promise.all([claim(USER_A), claim(USER_B)]);
    expect(attempts.reduce((total, result) => total + result.rows.length, 0)).toBe(1);
  });

  it("enforces one ballot per user and unique candidate names per activity", async () => {
    await db.exec(`insert into candidates (activity_id, name, name_key, created_by_id) values ('${ACTIVITY}', '火锅', '火锅', '${USER_A}')`);
    await expect(
      db.exec(`insert into candidates (activity_id, name, name_key, created_by_id) values ('${ACTIVITY}', '火 锅', '火锅', '${USER_B}')`)
    ).rejects.toThrow();
    await db.exec(`insert into ballots (activity_id, user_id) values ('${ACTIVITY}', '${USER_A}')`);
    await expect(db.exec(`insert into ballots (activity_id, user_id) values ('${ACTIVITY}', '${USER_A}')`)).rejects.toThrow();
  });

  it("deduplicates retried activity creation using a client request id", async () => {
    const requestId = "30000000-0000-4000-8000-000000000001";
    await db.exec(
      `insert into activities (title, event_date, client_request_id, created_by_id)
       values ('2026年8月6日', '2026-08-06', '${requestId}', '${USER_A}')`
    );
    await expect(
      db.exec(
        `insert into activities (title, event_date, client_request_id, created_by_id)
         values ('重复请求', '2026-08-06', '${requestId}', '${USER_A}')`
      )
    ).rejects.toThrow();
  });

  it("only lets the manager delete one activity and cascades its data", async () => {
    await db.exec(`
      insert into sessions (user_id, token_hash, expires_at) values ('${USER_A}', 'token', now() + interval '1 day');
      update activities set manager_user_id = '${USER_A}' where id = '${ACTIVITY}';
      insert into activities (id, title, created_by_id, manager_user_id)
        values ('10000000-0000-4000-8000-000000000002', '保留的活动', '${USER_B}', '${USER_B}');
      insert into candidates (activity_id, name, name_key, created_by_id) values ('${ACTIVITY}', '火锅', '火锅', '${USER_A}');
      insert into ballots (activity_id, user_id) values ('${ACTIVITY}', '${USER_A}');
      insert into ballot_items (ballot_id, candidate_id, position)
        select ballots.id, candidates.id, 0 from ballots, candidates where ballots.activity_id = '${ACTIVITY}' and candidates.activity_id = '${ACTIVITY}';
    `);
    const denied = await db.query(
      `delete from activities where id = $1 and manager_user_id = $2 returning id`,
      [ACTIVITY, USER_B]
    );
    expect(denied.rows).toHaveLength(0);

    const deleted = await db.query(
      `delete from activities where id = $1 and manager_user_id = $2 returning id`,
      [ACTIVITY, USER_A]
    );
    expect(deleted.rows).toHaveLength(1);

    const counts = await db.query<{ users: number; sessions: number; activities: number; candidates: number; ballots: number }>(
      `select
        (select count(*)::int from users) users,
        (select count(*)::int from sessions) sessions,
        (select count(*)::int from activities) activities,
        (select count(*)::int from candidates) candidates,
        (select count(*)::int from ballots) ballots`
    );
    expect(counts.rows[0]).toEqual({ users: 2, sessions: 1, activities: 1, candidates: 0, ballots: 0 });
  });
});
