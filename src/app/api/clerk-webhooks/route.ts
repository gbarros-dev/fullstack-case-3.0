import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import {
	type ClerkUserWebhookEvent,
	handleUserCreated,
	handleUserDeleted,
	handleUserUpdated,
} from "@/server/clerk-webhooks/handlers";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
const webhook = WEBHOOK_SECRET ? new Webhook(WEBHOOK_SECRET) : null;

function parseEventPayload(payload: unknown) {
	const event = payload as { type: string; data: ClerkUserWebhookEvent };
	return event;
}

export async function POST(req: Request) {
	if (!webhook) {
		console.error(
			"CLERK_WEBHOOK_SECRET is not configured. Set it in your environment to receive Clerk webhooks.",
		);
		return new NextResponse("Webhook secret is not configured", {
			status: 500,
		});
	}

	const body = await req.text();
	const headerPayload = await headers();
	const svixId = headerPayload.get("svix-id");
	const svixTimestamp = headerPayload.get("svix-timestamp");
	const svixSignature = headerPayload.get("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return new NextResponse("Missing Svix signature headers", { status: 400 });
	}

	let evt: { type: string; data: ClerkUserWebhookEvent };

	try {
		evt = parseEventPayload(
			webhook.verify(body, {
				"svix-id": svixId,
				"svix-timestamp": svixTimestamp,
				"svix-signature": svixSignature,
			}),
		);
	} catch (error) {
		console.error("Failed to verify Clerk webhook", error);
		return new NextResponse("Invalid signature", { status: 400 });
	}

	try {
		switch (evt.type) {
			case "user.created": {
				await handleUserCreated(evt.data);
				break;
			}
			case "user.updated": {
				await handleUserUpdated(evt.data);
				break;
			}
			case "user.deleted": {
				await handleUserDeleted(evt.data);
				break;
			}
			default:
				break;
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error(`Error handling Clerk webhook event ${evt.type}`, error);
		return new NextResponse("Internal Server Error", { status: 500 });
	}
}
