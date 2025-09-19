import Pusher from "pusher";

if (!process.env.PUSHER_APP_ID) {
	throw new Error("PUSHER_APP_ID is required");
}

if (!process.env.PUSHER_SECRET) {
	throw new Error("PUSHER_SECRET is required");
}

if (!process.env.NEXT_PUBLIC_PUSHER_APP_KEY) {
	throw new Error("NEXT_PUBLIC_PUSHER_APP_KEY is required");
}

if (!process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
	throw new Error("NEXT_PUBLIC_PUSHER_CLUSTER is required");
}

export const pusher = new Pusher({
	appId: process.env.PUSHER_APP_ID,
	key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY,
	secret: process.env.PUSHER_SECRET,
	cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
	useTLS: true,
});

// Event types for type safety
export interface MessageEvent {
	id: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	threadId: string;
	sender: {
		id: string;
		username: string;
	};
}

export interface MessageEditedEvent {
	id: string;
	content: string;
	editedAt: string;
	threadId: string;
}

export interface MessageDeletedEvent {
	id: string;
	threadId: string;
}

export interface UserStatusEvent {
	userId: string;
	username: string;
	isOnline: boolean;
}

export interface ThreadCreatedEvent {
	id: string;
	name: string | null;
	createdAt: string;
	lastMessageAt: string;
	participants: Array<{
		id: string;
		username: string;
	}>;
}

// Helper functions for triggering events
export const triggerNewMessage = async (
	threadId: string,
	message: MessageEvent,
) => {
	await pusher.trigger(`thread-${threadId}`, "new-message", message);
};

export const triggerUserStatus = async (
	userId: string,
	statusData: UserStatusEvent,
) => {
	await pusher.trigger(`user-${userId}`, "status-change", statusData);
};

export const triggerThreadCreated = async (
	userId: string,
	threadData: ThreadCreatedEvent,
) => {
	await pusher.trigger(`user-${userId}`, "thread-created", threadData);
};

export const triggerMessageEdited = async (
	threadId: string,
	editedData: MessageEditedEvent,
) => {
	await pusher.trigger(`thread-${threadId}`, "message-edited", editedData);
};

export const triggerMessageDeleted = async (
	threadId: string,
	deletedData: MessageDeletedEvent,
) => {
	await pusher.trigger(`thread-${threadId}`, "message-deleted", deletedData);
};
