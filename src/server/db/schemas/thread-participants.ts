import { relations } from "drizzle-orm";
import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { threads } from "./threads";
import { users } from "./users";

export const threadParticipants = pgTable(
	"thread_participants",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		threadId: uuid("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
	},
	(table) => {
		return {
			uniqueThreadUser: unique().on(table.threadId, table.userId),
		};
	},
);

export const threadParticipantsRelations = relations(
	threadParticipants,
	({ one }) => ({
		thread: one(threads, {
			fields: [threadParticipants.threadId],
			references: [threads.id],
		}),
		user: one(users, {
			fields: [threadParticipants.userId],
			references: [users.id],
		}),
	}),
);

export type ThreadParticipant = typeof threadParticipants.$inferSelect;
export type NewThreadParticipant = typeof threadParticipants.$inferInsert;
