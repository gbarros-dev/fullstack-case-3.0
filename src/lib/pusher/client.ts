import Pusher from "pusher-js";

if (!process.env.NEXT_PUBLIC_PUSHER_APP_KEY) {
	throw new Error("NEXT_PUBLIC_PUSHER_APP_KEY is required");
}

if (!process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
	throw new Error("NEXT_PUBLIC_PUSHER_CLUSTER is required");
}

// Store validated environment variables
const PUSHER_APP_KEY = process.env.NEXT_PUBLIC_PUSHER_APP_KEY as string;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string;

// Create singleton Pusher client
let pusherClient: Pusher | null = null;

export const getPusherClient = (): Pusher => {
	if (!pusherClient) {
		pusherClient = new Pusher(PUSHER_APP_KEY, {
			cluster: PUSHER_CLUSTER,
			forceTLS: true,
		});
	}
	return pusherClient;
};

// Cleanup function
export const disconnectPusher = () => {
	if (pusherClient) {
		pusherClient.disconnect();
		pusherClient = null;
	}
};
