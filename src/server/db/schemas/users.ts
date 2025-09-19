import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { threadParticipants } from "./thread-participants";

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	clerkUserId: text("clerk_user_id").notNull().unique(),
	username: text("username").notNull().unique(),
	primaryEmail: text("primary_email"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
	threadParticipants: many(threadParticipants),
	sentMessages: many(messages),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
