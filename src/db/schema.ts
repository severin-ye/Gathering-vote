import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    usernameKey: text("username_key").notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("users_username_key_unique").on(table.usernameKey)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId)
  ]
);

export const userNotes = pgTable(
  "user_notes",
  {
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.targetUserId] }),
    index("user_notes_owner_idx").on(table.ownerUserId)
  ]
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    eventDate: date("event_date", { mode: "string" }).default(sql`CURRENT_DATE`).notNull(),
    clientRequestId: uuid("client_request_id").defaultRandom().notNull(),
    description: text("description").notNull().default(""),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    managerUserId: uuid("manager_user_id").references(() => users.id),
    nominationEndsAt: timestamp("nomination_ends_at", { withTimezone: true }),
    votingEndsAt: timestamp("voting_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("activities_manager_idx").on(table.managerUserId),
    index("activities_created_at_idx").on(table.createdAt),
    uniqueIndex("activities_client_request_id_unique").on(table.clientRequestId)
  ]
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    description: text("description").notNull().default(""),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("candidates_activity_name_unique").on(table.activityId, table.nameKey),
    index("candidates_activity_idx").on(table.activityId)
  ]
);

export const activityParticipants = pgTable(
  "activity_participants",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.userId] }),
    index("activity_participants_activity_idx").on(table.activityId)
  ]
);

export const activityTimeOptions = pgTable(
  "activity_time_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("arrival"),
    hour: integer("hour").notNull(),
    minute: integer("minute").notNull().default(0),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("activity_time_options_time_unique").on(
      table.activityId,
      table.kind,
      table.hour,
      table.minute
    ),
    uniqueIndex("activity_time_options_activity_id_id_unique").on(table.activityId, table.id),
    index("activity_time_options_activity_idx").on(table.activityId),
    check("activity_time_options_hour_check", sql`${table.hour} between 0 and 23`),
    check("activity_time_options_minute_check", sql`${table.minute} between 0 and 59`),
    check("activity_time_options_kind_check", sql`${table.kind} in ('arrival', 'departure')`)
  ]
);

export const activityTimeVotes = pgTable(
  "activity_time_votes",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.optionId, table.userId] }),
    foreignKey({
      columns: [table.activityId, table.optionId],
      foreignColumns: [activityTimeOptions.activityId, activityTimeOptions.id],
      name: "activity_time_votes_activity_option_fk"
    }).onDelete("cascade"),
    index("activity_time_votes_activity_user_idx").on(table.activityId, table.userId)
  ]
);

export const ballots = pgTable(
  "ballots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("ballots_activity_user_unique").on(table.activityId, table.userId),
    index("ballots_activity_idx").on(table.activityId)
  ]
);

export const ballotItems = pgTable(
  "ballot_items",
  {
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => ballots.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    position: integer("position").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.ballotId, table.candidateId] }),
    uniqueIndex("ballot_items_position_unique").on(table.ballotId, table.position)
  ]
);

export type User = typeof users.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
