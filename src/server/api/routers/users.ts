import { TRPCError } from "@trpc/server";
import { eq, ilike, ne } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schemas/users";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// Enhanced input validation schemas
const searchUsersSchema = z.object({
	username: z
		.string()
		.min(1, "Username query is required")
		.max(50, "Username query too long")
		.regex(/^[a-zA-Z0-9._-]*$/, "Username query contains invalid characters"),
	limit: z.number().min(1).max(20).default(10),
});

const userIdSchema = z
	.string()
	.uuid("Invalid user ID format")
	.describe("User UUID identifier");

export const usersRouter = createTRPCRouter({
	// Health check endpoint - public procedure for monitoring
	health: publicProcedure.query(async ({ ctx }) => {
		try {
			// Simple database connectivity check
			await ctx.db.select().from(users).limit(1);
			return {
				status: "healthy",
				timestamp: new Date().toISOString(),
				database: "connected",
				requestId: ctx.requestId, // Include request ID for tracing
			};
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Database connectivity issue",
				cause: error,
			});
		}
	}),

	// Test endpoint to demonstrate request logging with input
	testLogging: publicProcedure
		.input(
			z.object({
				message: z.string().min(1).max(100),
				level: z.enum(["info", "warn", "error"]).default("info"),
			}),
		)
		.query(async ({ ctx, input }) => {
			// This endpoint demonstrates the request logging features
			return {
				echo: input.message,
				level: input.level,
				requestId: ctx.requestId,
				timestamp: new Date().toISOString(),
				processingTime: Date.now() - ctx.requestStartTime,
			};
		}),

	me: protectedProcedure.query(async ({ ctx }) => {
		const user = await ctx.db
			.select({
				id: users.id,
				username: users.username,
				firstName: users.firstName,
				lastName: users.lastName,
				primaryEmail: users.primaryEmail,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(eq(users.id, ctx.auth.userId))
			.limit(1);

		if (user.length === 0) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Current user not found",
			});
		}

		return user[0];
	}),

	getById: protectedProcedure
		.input(userIdSchema)
		.query(async ({ ctx, input }) => {
			const user = await ctx.db
				.select({
					id: users.id,
					username: users.username,
					firstName: users.firstName,
					lastName: users.lastName,
					primaryEmail: users.primaryEmail,
					createdAt: users.createdAt,
				})
				.from(users)
				.where(eq(users.id, input))
				.limit(1);

			if (user.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			return user[0];
		}),

	searchByUsername: protectedProcedure
		.input(searchUsersSchema)
		.query(async ({ ctx, input }) => {
			const searchResults = await ctx.db
				.select({
					id: users.id,
					username: users.username,
					firstName: users.firstName,
					lastName: users.lastName,
					primaryEmail: users.primaryEmail,
					createdAt: users.createdAt,
				})
				.from(users)
				.where(
					ilike(users.username, `%${input.username}%`) &&
						ne(users.id, ctx.auth.userId),
				)
				.limit(input.limit);

			return searchResults;
		}),

	getAll: protectedProcedure.query(async ({ ctx }) => {
		const allUsers = await ctx.db
			.select({
				id: users.id,
				username: users.username,
				firstName: users.firstName,
				lastName: users.lastName,
				primaryEmail: users.primaryEmail,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(ne(users.id, ctx.auth.userId));

		return allUsers;
	}),
});
