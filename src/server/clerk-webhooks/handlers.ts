import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DatabaseError } from "pg";
import { getClerkBackendClient } from "../clerk/client";
import { db } from "../db/client";
import { users } from "../db/schemas/users";

let missingSecretWarningLogged = false;

export type ClerkUserWebhookEvent = {
	id: string;
	username: string | null;
	email_addresses?: Array<{ id: string; email_address: string }>;
	primary_email_address_id?: string | null;
	first_name?: string | null;
	last_name?: string | null;
};

function extractEmailAddress(user: ClerkUserWebhookEvent) {
	if (!user.email_addresses || user.email_addresses.length === 0) {
		return null;
	}
	if (user.primary_email_address_id) {
		const primary = user.email_addresses.find(
			(email) => email.id === user.primary_email_address_id,
		);
		if (primary) {
			return primary.email_address;
		}
	}
	return user.email_addresses[0]?.email_address ?? null;
}

function normaliseUsername(user: ClerkUserWebhookEvent) {
	const email = extractEmailAddress(user);
	const initial = user.username ?? email?.split("@")[0] ?? user.id;
	const base = initial
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	let username = base || `user-${user.id.slice(-6)}`;
	if (username.length < 4) {
		username = `${username}${user.id.replace(/[^a-z0-9]/gi, "").slice(0, 4)}`;
	}
	if (username.length > 64) {
		username = username.slice(0, 64);
	}
	return username;
}

async function resolveUserDetails(user: ClerkUserWebhookEvent) {
	let primaryEmail = extractEmailAddress(user);
	let firstName = user.first_name ?? null;
	let lastName = user.last_name ?? null;

	if (primaryEmail && firstName && lastName) {
		return { primaryEmail, firstName, lastName };
	}

	const clerk = getClerkBackendClient();
	if (!clerk) {
		if (!missingSecretWarningLogged) {
			console.warn(
				"CLERK_SECRET_KEY is not set; skipping Clerk lookup for additional user data.",
			);
			missingSecretWarningLogged = true;
		}
		return { primaryEmail, firstName, lastName };
	}

	try {
		const clerkUser = await clerk.users.getUser(user.id);
		primaryEmail = clerkUser.primaryEmailAddress?.emailAddress ?? primaryEmail;
		firstName = clerkUser.firstName ?? firstName;
		lastName = clerkUser.lastName ?? lastName;
	} catch (error) {
		console.error(
			`Failed to fetch user ${user.id} from Clerk for webhook enrichment`,
			error,
		);
	}

	return { primaryEmail, firstName, lastName };
}

async function upsertUser(user: ClerkUserWebhookEvent) {
	const baseUsername = normaliseUsername(user);
	let username = baseUsername;
	while (username.length < 4) {
		username = `${username}-${randomUUID().slice(0, 4)}`;
	}

	const { primaryEmail, firstName, lastName } = await resolveUserDetails(user);

	try {
		await db
			.insert(users)
			.values({
				clerkUserId: user.id,
				username,
				primaryEmail,
				firstName,
				lastName,
			})
			.onConflictDoUpdate({
				target: users.clerkUserId,
				set: {
					username,
					primaryEmail,
					firstName,
					lastName,
					updatedAt: new Date(),
				},
			});
	} catch (error) {
		if (error instanceof DatabaseError && error.code === "23505") {
			const fallbackUsername =
				`${baseUsername}-${randomUUID().slice(0, 6)}`.slice(0, 64);
			await db
				.insert(users)
				.values({
					clerkUserId: user.id,
					username: fallbackUsername,
					primaryEmail,
					firstName,
					lastName,
				})
				.onConflictDoUpdate({
					target: users.clerkUserId,
					set: {
						username: fallbackUsername,
						primaryEmail,
						firstName,
						lastName,
						updatedAt: new Date(),
					},
				});
			return;
		}
		throw error;
	}
}

export async function handleUserCreated(user: ClerkUserWebhookEvent) {
	await upsertUser(user);
}

export async function handleUserUpdated(user: ClerkUserWebhookEvent) {
	await upsertUser(user);
}

export async function handleUserDeleted(user: ClerkUserWebhookEvent) {
	await db.delete(users).where(eq(users.clerkUserId, user.id));
}
