import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { triggerThreadCreated } from "@/lib/pusher/server";
import { threadParticipants } from "../../db/schemas/thread-participants";
import { threads } from "../../db/schemas/threads";
import { users } from "../../db/schemas/users";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const threadsRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		const userThreads = await ctx.db
			.select({
				thread: {
					id: threads.id,
					name: threads.name,
					createdAt: threads.createdAt,
					lastMessageAt: threads.lastMessageAt,
				},
			})
			.from(threadParticipants)
			.innerJoin(threads, eq(threadParticipants.threadId, threads.id))
			.where(eq(threadParticipants.userId, ctx.auth.userId))
			.orderBy(desc(threads.lastMessageAt));

		const threadsWithParticipants = await Promise.all(
			userThreads.map(async ({ thread }) => {
				const participants = await ctx.db
					.select({
						id: users.id,
						username: users.username,
					})
					.from(threadParticipants)
					.innerJoin(users, eq(threadParticipants.userId, users.id))
					.where(eq(threadParticipants.threadId, thread.id));

				return {
					...thread,
					participants,
				};
			}),
		);

		return threadsWithParticipants;
	}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().optional(),
				participantIds: z
					.array(z.string().uuid())
					.min(1, "At least one participant is required"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existingUsers = await ctx.db
				.select({ id: users.id })
				.from(users)
				.where(inArray(users.id, input.participantIds));

			if (existingUsers.length !== input.participantIds.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "One or more participant IDs are invalid",
				});
			}

			const newThread = await ctx.db
				.insert(threads)
				.values({
					name: input.name,
				})
				.returning();

			const thread = newThread[0];

			if (!thread) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create thread",
				});
			}

			const allParticipantIds = [...input.participantIds, ctx.auth.userId];
			const uniqueParticipantIds = [...new Set(allParticipantIds)];

			await ctx.db.insert(threadParticipants).values(
				uniqueParticipantIds.map((userId) => ({
					threadId: thread.id,
					userId,
				})),
			);

			const participants = await ctx.db
				.select({
					id: users.id,
					username: users.username,
				})
				.from(threadParticipants)
				.innerJoin(users, eq(threadParticipants.userId, users.id))
				.where(eq(threadParticipants.threadId, thread.id));

			const threadEventPayload = {
				id: thread.id,
				name: thread.name ?? null,
				createdAt: thread.createdAt.toISOString(),
				lastMessageAt: thread.lastMessageAt.toISOString(),
				participants,
			};

			await Promise.all(
				participants.map((participant) =>
					triggerThreadCreated(participant.id, threadEventPayload).catch(
						(error) => {
							console.error(
								`Failed to publish thread-created event for user ${participant.id}`,
								error,
							);
						},
					),
				),
			);

			return thread;
		}),

	getById: protectedProcedure
		.input(z.string().uuid("Invalid thread ID"))
		.query(async ({ ctx, input }) => {
			const participation = await ctx.db
				.select()
				.from(threadParticipants)
				.where(
					and(
						eq(threadParticipants.threadId, input),
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

			const thread = await ctx.db
				.select()
				.from(threads)
				.where(eq(threads.id, input))
				.limit(1);

			if (thread.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Thread not found",
				});
			}

			const participants = await ctx.db
				.select({
					id: users.id,
					username: users.username,
					joinedAt: threadParticipants.joinedAt,
				})
				.from(threadParticipants)
				.innerJoin(users, eq(threadParticipants.userId, users.id))
				.where(eq(threadParticipants.threadId, input));

			return {
				...thread[0],
				participants,
			};
		}),

	addParticipant: protectedProcedure
		.input(
			z.object({
				threadId: z.string().uuid("Invalid thread ID"),
				userId: z.string().uuid("Invalid user ID"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
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

			const userExists = await ctx.db
				.select()
				.from(users)
				.where(eq(users.id, input.userId))
				.limit(1);

			if (userExists.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			const existingParticipation = await ctx.db
				.select()
				.from(threadParticipants)
				.where(
					and(
						eq(threadParticipants.threadId, input.threadId),
						eq(threadParticipants.userId, input.userId),
					),
				)
				.limit(1);

			if (existingParticipation.length > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "User is already a participant in this thread",
				});
			}

			await ctx.db.insert(threadParticipants).values({
				threadId: input.threadId,
				userId: input.userId,
			});

			return { success: true };
		}),
});
