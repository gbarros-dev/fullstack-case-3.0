import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { threads } from "./threads";
import { users } from "./users";

export const messages = pgTable("messages", {
	id: uuid("id").defaultRandom().primaryKey(),
	threadId: uuid("thread_id")
		.notNull()
		.references(() => threads.id, { onDelete: "cascade" }),
	senderId: uuid("sender_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	content: text("content").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	editedAt: timestamp("edited_at"),
	isDeleted: boolean("is_deleted").notNull().default(false),
});

export const messagesRelations = relations(messages, ({ one }) => ({
	thread: one(threads, {
		fields: [messages.threadId],
		references: [threads.id],
	}),
	sender: one(users, {
		fields: [messages.senderId],
		references: [users.id],
	}),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
