import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
	triggerMessageDeleted,
	triggerMessageEdited,
	triggerNewMessage,
} from "@/lib/pusher/server";
import { messages } from "../../db/schemas/messages";
import { threadParticipants } from "../../db/schemas/thread-participants";
import { threads } from "../../db/schemas/threads";
import { users } from "../../db/schemas/users";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messagesRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				threadId: z.uuid("Invalid thread ID"),
				limit: z.number().min(1).max(100).default(50),
				cursor: z
					.object({
						id: z.string().uuid(),
						createdAt: z.coerce.date(),
					})
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const thread = await ctx.db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.id, input.threadId))
				.limit(1);

			if (thread.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Thread no longer exists",
				});
			}

			const participation = await ctx.db
				.select()
				.from(threadParticipants)
				.where(
					and(
						eq(threadParticipants.threadId, input.threadId),
						eq(threadParticipants.userId, ctx.auth.userId),
					),
				)
				.limit(1);

			if (participation.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a participant in this thread",
				});
			}

			const baseCondition = and(
				eq(messages.threadId, input.threadId),
				eq(messages.isDeleted, false),
			);
			const cursorCondition = input.cursor
				? or(
						lt(messages.createdAt, input.cursor.createdAt),
						and(
							eq(messages.createdAt, input.cursor.createdAt),
							lt(messages.id, input.cursor.id),
						),
					)
				: undefined;
			const whereClause = cursorCondition
				? and(baseCondition, cursorCondition)
				: baseCondition;

			const messageList = await ctx.db
				.select({
					id: messages.id,
					content: messages.content,
					createdAt: messages.createdAt,
					updatedAt: messages.updatedAt,
					editedAt: messages.editedAt,
					isDeleted: messages.isDeleted,
					sender: {
						id: users.id,
						username: users.username,
					},
				})
				.from(messages)
				.innerJoin(users, eq(messages.senderId, users.id))
				.where(whereClause)
				.orderBy(desc(messages.createdAt), desc(messages.id))
				.limit(input.limit + 1);

			const hasMore = messageList.length > input.limit;
			const trimmedMessages = hasMore ? messageList.slice(0, -1) : messageList;
			const chronologicalMessages = [...trimmedMessages].reverse();
			const nextCursor =
				hasMore && trimmedMessages.length > 0
					? {
							id: trimmedMessages[trimmedMessages.length - 1].id,
							createdAt:
								trimmedMessages[
									trimmedMessages.length - 1
								].createdAt.toISOString(),
						}
					: null;

			return {
				messages: chronologicalMessages.map((message) => ({
					...message,
					createdAt: message.createdAt.toISOString(),
					updatedAt: message.updatedAt.toISOString(),
					editedAt: message.editedAt?.toISOString() ?? null,
				})),
				nextCursor,
			};
		}),

	send: protectedProcedure
		.input(
			z.object({
				threadId: z.uuid("Invalid thread ID"),
				content: z
					.string()
					.min(1, "Message content cannot be empty")
					.max(1000, "Message too long"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const thread = await ctx.db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.id, input.threadId))
				.limit(1);

			if (thread.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Thread no longer exists",
				});
			}

			const participation = await ctx.db
				.select()
				.from(threadParticipants)
				.where(
					and(
						eq(threadParticipants.threadId, input.threadId),
						eq(threadParticipants.userId, ctx.auth.userId),
					),
				)
				.limit(1);

			if (participation.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a participant in this thread",
				});
			}

			const newMessage = await ctx.db
				.insert(messages)
				.values({
					threadId: input.threadId,
					senderId: ctx.auth.userId,
					content: input.content,
				})
				.returning();

			const message = newMessage[0];

			if (!message) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send message",
				});
			}

			await ctx.db
				.update(threads)
				.set({ lastMessageAt: new Date() })
				.where(eq(threads.id, input.threadId));

			const fullMessage = await ctx.db
				.select({
					id: messages.id,
					content: messages.content,
					createdAt: messages.createdAt,
					updatedAt: messages.updatedAt,
					editedAt: messages.editedAt,
					isDeleted: messages.isDeleted,
					sender: {
						id: users.id,
						username: users.username,
					},
				})
				.from(messages)
				.innerJoin(users, eq(messages.senderId, users.id))
				.where(eq(messages.id, message.id))
				.limit(1);

			const rawMessage = fullMessage[0];
			const messageData = rawMessage
				? {
						...rawMessage,
						createdAt: rawMessage.createdAt.toISOString(),
						updatedAt: rawMessage.updatedAt.toISOString(),
						editedAt: rawMessage.editedAt?.toISOString() ?? null,
					}
				: null;

			if (messageData) {
				// Trigger Pusher event for real-time message delivery
				try {
					await triggerNewMessage(input.threadId, {
						...messageData,
						threadId: input.threadId,
					});
				} catch (error) {
					console.error("Failed to send Pusher event:", error);
					// Don't fail the mutation if Pusher fails
				}
			}

			return messageData;
		}),

	getLatest: protectedProcedure
		.input(
			z.object({
				threadId: z.uuid("Invalid thread ID"),
				limit: z.number().min(1).max(10).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const thread = await ctx.db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.id, input.threadId))
				.limit(1);

			if (thread.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Thread no longer exists",
				});
			}

			const participation = await ctx.db
				.select()
				.from(threadParticipants)
				.where(
					and(
						eq(threadParticipants.threadId, input.threadId),
						eq(threadParticipants.userId, ctx.auth.userId),
					),
				)
				.limit(1);

			if (participation.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a participant in this thread",
				});
			}

			const latestMessages = await ctx.db
				.select({
					id: messages.id,
					content: messages.content,
					createdAt: messages.createdAt,
					updatedAt: messages.updatedAt,
					editedAt: messages.editedAt,
					isDeleted: messages.isDeleted,
					sender: {
						id: users.id,
						username: users.username,
					},
				})
				.from(messages)
				.innerJoin(users, eq(messages.senderId, users.id))
				.where(
					and(
						eq(messages.threadId, input.threadId),
						eq(messages.isDeleted, false),
					),
				)
				.orderBy(desc(messages.createdAt), desc(messages.id))
				.limit(input.limit);

			const chronological = [...latestMessages].reverse();
			return chronological.map((message) => ({
				...message,
				createdAt: message.createdAt.toISOString(),
				updatedAt: message.updatedAt.toISOString(),
				editedAt: message.editedAt?.toISOString() ?? null,
			}));
		}),

	edit: protectedProcedure
		.input(
			z.object({
				messageId: z.uuid("Invalid message ID"),
				content: z
					.string()
					.min(1, "Message content cannot be empty")
					.max(1000, "Message too long"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Check if user owns the message
			const messageToEdit = await ctx.db
				.select({
					id: messages.id,
					senderId: messages.senderId,
					threadId: messages.threadId,
					isDeleted: messages.isDeleted,
				})
				.from(messages)
				.where(eq(messages.id, input.messageId))
				.limit(1);

			const existingMessage = messageToEdit[0];
			if (!existingMessage) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Message not found",
				});
			}

			if (existingMessage.senderId !== ctx.auth.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You can only edit your own messages",
				});
			}

			if (existingMessage.isDeleted) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot edit deleted messages",
				});
			}

			// Update the message
			await ctx.db
				.update(messages)
				.set({
					content: input.content,
					editedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(messages.id, input.messageId));

			// Trigger Pusher event for real-time update
			try {
				await triggerMessageEdited(existingMessage.threadId, {
					id: input.messageId,
					content: input.content,
					editedAt: new Date().toISOString(),
					threadId: existingMessage.threadId,
				});
			} catch (error) {
				console.error("Failed to send Pusher edit event:", error);
				// Don't fail the mutation if Pusher fails
			}

			return { success: true };
		}),

	delete: protectedProcedure
		.input(
			z.object({
				messageId: z.uuid("Invalid message ID"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Check if user owns the message
			const messageToDelete = await ctx.db
				.select({
					id: messages.id,
					senderId: messages.senderId,
					threadId: messages.threadId,
					isDeleted: messages.isDeleted,
				})
				.from(messages)
				.where(eq(messages.id, input.messageId))
				.limit(1);

			const existingMessage = messageToDelete[0];
			if (!existingMessage) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Message not found",
				});
			}

			if (existingMessage.senderId !== ctx.auth.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You can only delete your own messages",
				});
			}

			if (existingMessage.isDeleted) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Message is already deleted",
				});
			}

			// Soft delete the message
			await ctx.db
				.update(messages)
				.set({
					isDeleted: true,
					updatedAt: new Date(),
				})
				.where(eq(messages.id, input.messageId));

			// Trigger Pusher event for real-time update
			try {
				await triggerMessageDeleted(existingMessage.threadId, {
					id: input.messageId,
					threadId: existingMessage.threadId,
				});
			} catch (error) {
				console.error("Failed to send Pusher delete event:", error);
				// Don't fail the mutation if Pusher fails
			}

			return { success: true };
		}),
});
