"use client";

import type { Channel } from "pusher-js";
import { useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher/client";
import type {
	MessageDeletedEvent,
	MessageEditedEvent,
	MessageEvent,
	UserStatusEvent,
} from "@/lib/pusher/server";

interface UsePusherChannelProps {
	channelName: string;
	onNewMessage?: (message: MessageEvent) => void;
	onUserStatusChange?: (statusData: UserStatusEvent) => void;
	onMessageEdited?: (editData: MessageEditedEvent) => void;
	onMessageDeleted?: (deleteData: MessageDeletedEvent) => void;
}

export const usePusherChannel = ({
	channelName,
	onNewMessage,
	onUserStatusChange,
	onMessageEdited,
	onMessageDeleted,
}: UsePusherChannelProps) => {
	const channelRef = useRef<Channel | null>(null);

	useEffect(() => {
		const pusher = getPusherClient();
		const channel = pusher.subscribe(channelName);
		channelRef.current = channel;

		// Bind event listeners
		if (onNewMessage) {
			channel.bind("new-message", onNewMessage);
		}

		if (onUserStatusChange) {
			channel.bind("status-change", onUserStatusChange);
		}

		if (onMessageEdited) {
			channel.bind("message-edited", onMessageEdited);
		}

		if (onMessageDeleted) {
			channel.bind("message-deleted", onMessageDeleted);
		}

		return () => {
			// Unbind event listeners
			if (onNewMessage) {
				channel.unbind("new-message", onNewMessage);
			}

			if (onUserStatusChange) {
				channel.unbind("status-change", onUserStatusChange);
			}

			if (onMessageEdited) {
				channel.unbind("message-edited", onMessageEdited);
			}

			if (onMessageDeleted) {
				channel.unbind("message-deleted", onMessageDeleted);
			}

			pusher.unsubscribe(channelName);
			channelRef.current = null;
		};
	}, [
		channelName,
		onNewMessage,
		onUserStatusChange,
		onMessageEdited,
		onMessageDeleted,
	]);

	return channelRef.current;
};
