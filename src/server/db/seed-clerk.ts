import { createClerkClient } from "@clerk/backend";
import { seedUsers } from "./seed-data";

type ClerkClient = ReturnType<typeof createClerkClient>;

function getClerkClient(): ClerkClient {
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!secretKey) {
		throw new Error(
			"CLERK_SECRET_KEY is required to seed Clerk users. Export it before running this script.",
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

async function seedClerk() {
	try {
		console.log("🌱 Starting Clerk-only seed...");
		const clerk = getClerkClient();

		for (const entry of seedUsers) {
			const { user, wasCreated } = await ensureClerkUser(clerk, entry);
			console.log(
				`${wasCreated ? "✅ Created" : "ℹ️  Reused"} Clerk user ${entry.email} (${entry.username}) with id ${user.id}`,
			);
		}

		console.log("✅ Clerk seed completed.");
	} catch (error) {
		console.error("❌ Clerk seed failed:", error);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

void seedClerk();
