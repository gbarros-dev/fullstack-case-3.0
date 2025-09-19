import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { DatabaseError } from "pg";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schemas/users";

// Request logging utilities
function generateRequestId(): string {
	return randomUUID().slice(0, 8);
}

function sanitizeInput(input: unknown): string {
	try {
		const stringified = JSON.stringify(input);
		// Truncate very long inputs for logging
		if (stringified.length > 500) {
			return `${stringified.slice(0, 500)}...[truncated]`;
		}
		return stringified;
	} catch {
		return "[Unable to stringify input]";
	}
}

interface ContextOptions {
	headers: Headers;
	clerkAuth?: { userId: string | null };
}

interface AuthContext {
	userId: string | null;
	clerkUserId: string | null;
	metadata?: Record<string, unknown>;
}

export interface TRPCContext {
	db: typeof db;
	auth: AuthContext;
	headers: Headers;
	responseHeaders: Headers;
	requestId: string;
	requestStartTime: number;
}

async function resolveUser(clerkUserId: string) {
	const existing = await db
		.select({
			id: users.id,
			primaryEmail: users.primaryEmail,
			firstName: users.firstName,
			lastName: users.lastName,
		})
		.from(users)
		.where(eq(users.clerkUserId, clerkUserId))
		.limit(1);

	const existingUser = existing[0];
	const needsProfileSync = existingUser
		? !existingUser.primaryEmail ||
			!existingUser.firstName ||
			!existingUser.lastName
		: true;

	let clerkUser: {
		id: string;
		username?: string | null;
		primaryEmailAddress?: { emailAddress: string } | null;
		firstName?: string | null;
		lastName?: string | null;
	};
	if (needsProfileSync) {
		try {
			const clerk = await clerkClient();
			clerkUser = await clerk.users.getUser(clerkUserId);
		} catch (error) {
			console.error("Failed to load Clerk user", error);
			return existingUser ? existingUser.id : null;
		}
	} else if (existingUser) {
		return existingUser.id;
	} else {
		// Should not happen, but guard against missing Clerk data
		return null;
	}

	const candidateUsername =
		clerkUser.username ??
		clerkUser.primaryEmailAddress?.emailAddress ??
		clerkUser.id;
	const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress ?? null;
	const firstName = clerkUser.firstName ?? null;
	const lastName = clerkUser.lastName ?? null;

	if (existingUser) {
		await db
			.update(users)
			.set({
				primaryEmail,
				firstName,
				lastName,
				updatedAt: new Date(),
			})
			.where(eq(users.id, existingUser.id));
		return existingUser.id;
	}

	try {
		const [created] = await db
			.insert(users)
			.values({
				clerkUserId,
				username: candidateUsername,
				primaryEmail,
				firstName,
				lastName,
			})
			.returning({ id: users.id });

		return created.id;
	} catch (error) {
		if (error instanceof DatabaseError && error.code === "23505") {
			const fallbackUsername = `${candidateUsername}-${randomUUID().slice(0, 6)}`;
			const [created] = await db
				.insert(users)
				.values({
					clerkUserId,
					username: fallbackUsername,
					primaryEmail,
					firstName,
					lastName,
				})
				.returning({ id: users.id });
			return created.id;
		}
		throw error;
	}
}

export const createTRPCContext = async (
	opts: ContextOptions,
): Promise<TRPCContext> => {
	const clerkUserId = opts.clerkAuth?.userId ?? null;
	const userId = clerkUserId ? await resolveUser(clerkUserId) : null;

	// Extract any custom metadata from headers (for future organization support)
	const customOrgId = opts.headers.get("x-organization-id");
	const metadata: Record<string, unknown> = {};
	if (customOrgId) {
		metadata.organizationId = customOrgId;
	}

	const auth: AuthContext = {
		userId,
		clerkUserId,
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
	};

	return {
		db,
		headers: opts.headers,
		auth,
		responseHeaders: new Headers(),
		requestId: generateRequestId(),
		requestStartTime: Date.now(),
	};
};

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

export const createCallerFactory = t.createCallerFactory;

export const createTRPCRouter = t.router;

const requestLoggingMiddleware = t.middleware(
	async ({ next, path, type, ctx, input, meta }) => {
		const { requestId, auth } = ctx;
		const userContext = auth.userId
			? { userId: auth.userId, clerkUserId: auth.clerkUserId }
			: { anonymous: true };

		// Log request start only when explicitly enabled to avoid noisy consoles
		const shouldLogRequests = process.env.TRPC_LOG_REQUESTS === "true";

		if (shouldLogRequests) {
			console.info(`[TRPC:${requestId}] Request started`, {
				requestId,
				path,
				type,
				userContext,
				input: sanitizeInput(input),
				timestamp: new Date().toISOString(),
				meta: meta ? sanitizeInput(meta) : undefined,
			});
		}

		try {
			const result = await next();

			// Log successful completion
			const duration = Date.now() - ctx.requestStartTime;
			if (shouldLogRequests) {
				console.info(`[TRPC:${requestId}] Request completed successfully`, {
					requestId,
					path,
					type,
					duration,
					userContext,
					timestamp: new Date().toISOString(),
				});
			}

			return result;
		} catch (error) {
			// Log error (detailed logging is handled by errorHandlingMiddleware)
			const duration = Date.now() - ctx.requestStartTime;
			console.error(`[TRPC:${requestId}] Request failed`, {
				requestId,
				path,
				type,
				duration,
				userContext,
				error: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			});
			throw error;
		}
	},
);

const timingMiddleware = t.middleware(async ({ next, path, ctx }) => {
	const start = Date.now();

	const result = await next();

	const end = Date.now();
	const duration = end - start;

	// Log slow operations with request ID
	if (duration > 1000) {
		console.warn(
			`[TRPC:${ctx.requestId}] Slow operation detected: ${path} took ${duration}ms to execute`,
		);
	}

	return result;
});

const errorHandlingMiddleware = t.middleware(
	async ({ next, path, type, ctx }) => {
		try {
			return await next();
		} catch (error) {
			// Enhanced error logging with request ID
			console.error(
				`[TRPC:${ctx.requestId}] Error in ${type} procedure '${path}':`,
				{
					requestId: ctx.requestId,
					error: error instanceof Error ? error.message : "Unknown error",
					stack: error instanceof Error ? error.stack : undefined,
					userContext: ctx.auth.userId
						? {
								userId: ctx.auth.userId,
								clerkUserId: ctx.auth.clerkUserId,
							}
						: { anonymous: true },
					timestamp: new Date().toISOString(),
					...(error instanceof TRPCError && {
						code: error.code,
						cause: error.cause,
					}),
				},
			);
			throw error;
		}
	},
);

export const publicProcedure = t.procedure
	.use(requestLoggingMiddleware)
	.use(errorHandlingMiddleware)
	.use(timingMiddleware);

export const protectedProcedure = t.procedure
	.use(requestLoggingMiddleware)
	.use(errorHandlingMiddleware)
	.use(timingMiddleware)
	.use(async ({ ctx, next }) => {
		if (!ctx.auth?.userId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required to access this resource",
			});
		}

		return next({
			ctx: {
				...ctx,
				auth: {
					userId: ctx.auth.userId as string,
					clerkUserId: ctx.auth.clerkUserId as string,
					metadata: ctx.auth.metadata,
				},
			},
		});
	});

// Enhanced procedure with additional validation for future use
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	// Future: Add admin role validation here
	// For now, just pass through
	return next({
		ctx: {
			...ctx,
			isAdmin: true, // Placeholder for future admin validation
		},
	});
});

export type ProtectedProcedureContext = Omit<TRPCContext, "auth"> & {
	auth: {
		userId: string;
		clerkUserId: string;
		metadata?: Record<string, unknown>;
	};
};
