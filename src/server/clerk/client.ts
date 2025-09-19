import { createClerkClient } from "@clerk/backend";

let cachedClient: ReturnType<typeof createClerkClient> | null = null;

export function getClerkBackendClient() {
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!secretKey) {
		return null;
	}

	if (!cachedClient) {
		cachedClient = createClerkClient({
			secretKey,
			publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		});
	}

	return cachedClient;
}
