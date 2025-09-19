import { createClerkClient } from "@clerk/backend";
import { db } from "./client";
import { users } from "./schemas/users";
import { seedUsers } from "./seed-data";

type ClerkClient = ReturnType<typeof createClerkClient>;

function getClerkClient(): ClerkClient {
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!secretKey) {
		throw new Error(
			"CLERK_SECRET_KEY is required to seed Clerk users. Export it before running the seed script.",
		);
	}

	return createClerkClient({
		secretKey,
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	});
}

async function ensureClerkUser(
	clerk: ClerkClient,
	input: (typeof seedUsers)[number],
) {
	const existing = await clerk.users.getUserList({
		emailAddress: [input.email],
		limit: 1,
	});

	const found = existing.data?.[0];
	if (found) {
		const shouldUpdateUsername = found.username !== input.username;
		const shouldUpdateFirstName =
			input.firstName && found.firstName !== input.firstName;
		const shouldUpdateLastName =
			input.lastName && found.lastName !== input.lastName;
		if (shouldUpdateUsername || shouldUpdateFirstName || shouldUpdateLastName) {
			const updated = await clerk.users.updateUser(found.id, {
				username: input.username,
				firstName: input.firstName,
				lastName: input.lastName,
			});
			return { user: updated, wasCreated: false } as const;
		}
		return { user: found, wasCreated: false } as const;
	}

	const created = await clerk.users.createUser({
		emailAddress: [input.email],
		password: input.password,
		username: input.username,
		firstName: input.firstName,
		lastName: input.lastName,
	});

	return { user: created, wasCreated: true } as const;
}

async function seed() {
	try {
		console.log("🌱 Starting database seed...");

		console.log("👥 Ensuring Clerk users exist...");
		const ensuredUsers: Array<{
			username: string;
			email: string;
			clerkUserId: string;
			status: "created" | "existing";
		}> = [];

		const clerk = getClerkClient();

		for (const entry of seedUsers) {
			const { user, wasCreated } = await ensureClerkUser(clerk, entry);
			ensuredUsers.push({
				username: entry.username,
				email: entry.email,
				clerkUserId: user.id,
				status: wasCreated ? "created" : "existing",
			});

			await db
				.insert(users)
				.values({
					clerkUserId: user.id,
					username: entry.username,
					primaryEmail: entry.email,
					firstName: entry.firstName,
					lastName: entry.lastName,
				})
				.onConflictDoUpdate({
					target: users.clerkUserId,
					set: {
						username: entry.username,
						primaryEmail: entry.email,
						firstName: entry.firstName,
						lastName: entry.lastName,
						updatedAt: new Date(),
					},
				});

			console.log(
				`${wasCreated ? "✅ Created" : "ℹ️  Reused"} Clerk user ${entry.email} (${entry.username})`,
			);
		}

		console.log("✅ Seed completed successfully! Linked users:");
		ensuredUsers.forEach((user) => {
			console.log(
				`- ${user.username} (${user.email}) → Clerk ID ${user.clerkUserId} [${user.status}]`,
			);
		});
	} catch (error) {
		console.error("❌ Seed failed:", error);
		console.error(
			"This might be because the database schema hasn't been pushed yet.",
		);
		console.error("Try running 'bun run db:push' first to create the tables.");
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

seed();
