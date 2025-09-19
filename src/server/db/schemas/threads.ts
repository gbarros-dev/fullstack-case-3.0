import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { threadParticipants } from "./thread-participants";

export const threads = pgTable("threads", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
});

export const threadsRelations = relations(threads, ({ many }) => ({
	participants: many(threadParticipants),
	messages: many(messages),
}));

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
