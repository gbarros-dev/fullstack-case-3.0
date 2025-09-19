"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Edit2, MoreVertical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { usePusherChannel } from "@/lib/hooks/usePusher";
import type {
	MessageDeletedEvent,
	MessageEditedEvent,
	MessageEvent,
} from "@/lib/pusher/server";
import { useTRPC } from "@/lib/trpc/react";

interface Message {
	id: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	editedAt?: string | null;
	isDeleted?: boolean;
	sender: {
		id: string;
		username: string;
	};
}

interface MessageCursor {
	id: string;
	createdAt: string;
}

interface RealTimeMessagesProps {
	threadId: string;
	initialMessages: Message[];
	initialNextCursor: MessageCursor | null;
	currentUser: {
		id: string;
		username: string;
	};
}

function getTRPCErrorCode(error: unknown) {
	if (error instanceof TRPCClientError) {
		return error.data?.code;
	}
	if (typeof error === "object" && error !== null && "data" in error) {
		return (error as { data?: { code?: string } }).data?.code;
	}
	return undefined;
}

export function RealTimeMessages({
	threadId,
	initialMessages,
	initialNextCursor,
	currentUser,
}: RealTimeMessagesProps) {
	const [messages, setMessages] = useState<Message[]>(initialMessages);
	const [messageInput, setMessageInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [nextCursor, setNextCursor] = useState<MessageCursor | null>(
		initialNextCursor,
	);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");
	const bottomRef = useRef<HTMLDivElement | null>(null);

	// tRPC mutations
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();

	const sendMessageMutation = useMutation(
		trpc.messages.send.mutationOptions({
			onSuccess: async (newMessage) => {
				if (!newMessage) {
					setIsSubmitting(false);
					return;
				}
				// Message will be replaced via Pusher event - no need to invalidate queries
				setIsSubmitting(false);
				// Only invalidate threads list to update "last message" timestamp
				await queryClient
					.invalidateQueries({
						queryKey: trpc.threads.list.queryKey(),
					})
					.catch(() => undefined);
			},
			onError: (error) => {
				setIsSubmitting(false);
				if (getTRPCErrorCode(error) === "NOT_FOUND") {
					router.replace("/");
					return;
				}
				console.error("Failed to send message:", error);
			},
		}),
	);

	const editMessageMutation = useMutation(
		trpc.messages.edit.mutationOptions({
			onSuccess: () => {
				setEditingMessageId(null);
				setEditContent("");
			},
			onError: (error) => {
				if (getTRPCErrorCode(error) === "NOT_FOUND") {
					router.replace("/");
					return;
				}
				console.error("Failed to edit message:", error);
			},
		}),
	);

	const deleteMessageMutation = useMutation(
		trpc.messages.delete.mutationOptions({
			onError: (error) => {
				if (getTRPCErrorCode(error) === "NOT_FOUND") {
					router.replace("/");
					return;
				}
				console.error("Failed to delete message:", error);
			},
		}),
	);

	// Sync component state when prefetched data changes
	useEffect(() => {
		setMessages(initialMessages);
		setNextCursor(initialNextCursor);
		setMessageInput("");
	}, [initialMessages, initialNextCursor]);

	// Handle new messages from Pusher
	const handleNewMessage = useCallback((messageEvent: MessageEvent) => {
		const newMessage: Message = {
			id: messageEvent.id,
			content: messageEvent.content,
			createdAt: new Date(messageEvent.createdAt).toISOString(),
			updatedAt: new Date(messageEvent.updatedAt).toISOString(),
			sender: messageEvent.sender,
		};

		setMessages((prev) => {
			// Check if message already exists (avoid duplicates)
			const exists = prev.some((msg) => msg.id === newMessage.id);
			if (exists) return prev;

			// Replace optimistic message if this is from the current user
			const optimisticIndex = prev.findIndex(
				(msg) =>
					msg.id.startsWith("optimistic-") &&
					msg.content === newMessage.content &&
					msg.sender.id === newMessage.sender.id,
			);

			if (optimisticIndex !== -1) {
				// Replace optimistic message with real one
				const newMessages = [...prev];
				newMessages[optimisticIndex] = newMessage;
				return newMessages;
			}

			return [...prev, newMessage];
		});

		// Scroll to bottom for new incoming messages
		requestAnimationFrame(() =>
			bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
		);
	}, []);

	// Handle message edited events from Pusher
	const handleMessageEdited = useCallback((editEvent: MessageEditedEvent) => {
		setMessages((prev) =>
			prev.map((msg) =>
				msg.id === editEvent.id
					? { ...msg, content: editEvent.content, editedAt: editEvent.editedAt }
					: msg,
			),
		);
	}, []);

	// Handle message deleted events from Pusher
	const handleMessageDeleted = useCallback(
		(deleteEvent: MessageDeletedEvent) => {
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === deleteEvent.id ? { ...msg, isDeleted: true } : msg,
				),
			);
		},
		[],
	);

	// Subscribe to Pusher events
	usePusherChannel({
		channelName: `thread-${threadId}`,
		onNewMessage: handleNewMessage,
		onMessageEdited: handleMessageEdited,
		onMessageDeleted: handleMessageDeleted,
	});

	// Handle form submission
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!messageInput.trim() || isSubmitting) return;

		setIsSubmitting(true);
		const messageContent = messageInput.trim();

		// Add optimistic message immediately
		const optimisticId = `optimistic-${Date.now()}`;
		const optimisticMessage: Message = {
			id: optimisticId,
			content: messageContent,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sender: {
				id: currentUser.id,
				username: currentUser.username,
			},
		};

		setMessages((prev) => [...prev, optimisticMessage]);
		setMessageInput("");

		try {
			await sendMessageMutation.mutateAsync({
				threadId,
				content: messageContent,
			});
		} catch (error) {
			// Remove optimistic message on error
			setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
			setMessageInput(messageContent); // Restore the message
			throw error;
		}

		// Scroll after sending
		requestAnimationFrame(() =>
			bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
		);
	};

	// Handle edit message action
	const handleEditMessage = (message: Message) => {
		setEditingMessageId(message.id);
		setEditContent(message.content);
	};

	// Handle save edit
	const handleSaveEdit = async () => {
		if (!editingMessageId || !editContent.trim()) return;

		await editMessageMutation.mutateAsync({
			messageId: editingMessageId,
			content: editContent.trim(),
		});
	};

	// Handle cancel edit
	const handleCancelEdit = () => {
		setEditingMessageId(null);
		setEditContent("");
	};

	// Handle delete message action
	const handleDeleteMessage = async (messageId: string) => {
		if (confirm("Are you sure you want to delete this message?")) {
			await deleteMessageMutation.mutateAsync({ messageId });
		}
	};

	// Handle edit content key press
	const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSaveEdit();
		} else if (e.key === "Escape") {
			handleCancelEdit();
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setMessageInput(e.target.value);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e as React.FormEvent);
		}
	};

	// Scroll to the bottom whenever the message list updates
	useEffect(() => {
		if (messages.length === 0) {
			bottomRef.current?.scrollIntoView({ behavior: "auto" });
			return;
		}
		bottomRef.current?.scrollIntoView({ behavior: "auto" });
	}, [messages]);

	// Load older messages (pagination)
	const loadOlder = async () => {
		if (!nextCursor || isLoadingOlder) return;
		setIsLoadingOlder(true);
		try {
			const data = await queryClient.fetchQuery(
				trpc.messages.list.queryOptions({
					threadId,
					limit: 50,
					cursor: nextCursor ?? undefined,
				}),
			);
			if (data?.messages?.length) {
				setMessages((prev) => [...data.messages, ...prev]);
				setNextCursor(data.nextCursor ?? null);
			} else {
				setNextCursor(null);
			}
		} catch (error) {
			if (getTRPCErrorCode(error) === "NOT_FOUND") {
				router.replace("/");
				return;
			}

			console.error("Failed to load older messages:", error);
		} finally {
			setIsLoadingOlder(false);
		}
	};

	return (
		<div className="h-full flex flex-col">
			<ScrollArea className="flex-1 p-4">
				<div className="mx-auto max-w-2xl space-y-4">
					{nextCursor ? (
						<div className="flex justify-center">
							<Button
								variant="outline"
								size="sm"
								onClick={loadOlder}
								disabled={isLoadingOlder}
							>
								{isLoadingOlder ? "Loading..." : "Load older messages"}
							</Button>
						</div>
					) : null}
					{messages.map((message) => (
						<MessageBubble
							key={message.id}
							message={message}
							isCurrentUser={message.sender.id === currentUser.id}
							isEditing={editingMessageId === message.id}
							editContent={editContent}
							onEditContentChange={setEditContent}
							onEditKeyDown={handleEditKeyDown}
							onEdit={() => handleEditMessage(message)}
							onSaveEdit={handleSaveEdit}
							onCancelEdit={handleCancelEdit}
							onDelete={() => handleDeleteMessage(message.id)}
							isEditingLoading={editMessageMutation.isPending}
							isDeletingLoading={deleteMessageMutation.isPending}
						/>
					))}
					<div ref={bottomRef} />
				</div>
			</ScrollArea>

			<div className="border-t p-4">
				<form
					onSubmit={handleSubmit}
					className="mx-auto max-w-2xl flex items-end gap-2"
				>
					<Textarea
						value={messageInput}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						placeholder="Write a message..."
						className="min-h-[44px]"
						disabled={isSubmitting}
					/>
					<Button type="submit" disabled={isSubmitting || !messageInput.trim()}>
						{isSubmitting ? "Sending..." : "Send"}
					</Button>
				</form>
			</div>
		</div>
	);
}

function MessageBubble({
	message,
	isCurrentUser,
	isEditing,
	editContent,
	onEditContentChange,
	onEditKeyDown,
	onEdit,
	onSaveEdit,
	onCancelEdit,
	onDelete,
	isEditingLoading,
	isDeletingLoading,
}: {
	message: Message;
	isCurrentUser: boolean;
	isEditing: boolean;
	editContent: string;
	onEditContentChange: (value: string) => void;
	onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onEdit: () => void;
	onSaveEdit: () => void;
	onCancelEdit: () => void;
	onDelete: () => void;
	isEditingLoading: boolean;
	isDeletingLoading: boolean;
}) {
	if (message.isDeleted) {
		return (
			<div
				className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
			>
				<div className="flex items-start gap-3 max-w-[75%]">
					{!isCurrentUser && (
						<Avatar className="h-8 w-8 flex-shrink-0 opacity-50">
							<AvatarFallback className="text-xs">
								{message.sender.username.slice(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					)}
					<div className="rounded-lg px-3 py-2 text-sm leading-relaxed border bg-muted/50">
						<p className="text-muted-foreground italic">Message deleted</p>
						<p className="mt-1 text-[10px] text-muted-foreground">
							{new Date(message.createdAt).toLocaleTimeString()}
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}>
			<div className="flex items-start gap-3 max-w-[75%]">
				{!isCurrentUser && (
					<Avatar className="h-8 w-8 flex-shrink-0">
						<AvatarFallback className="text-xs">
							{message.sender.username.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				)}
				<div className="relative group">
					<div
						className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
							isCurrentUser
								? "bg-primary text-primary-foreground"
								: "border bg-background"
						}`}
					>
						{!isCurrentUser && (
							<p className="text-xs font-medium text-muted-foreground mb-1">
								{message.sender.username}
							</p>
						)}

						{isEditing ? (
							<div className="space-y-2">
								<Textarea
									value={editContent}
									onChange={(e) => onEditContentChange(e.target.value)}
									onKeyDown={onEditKeyDown}
									className="min-h-[60px] resize-none"
									disabled={isEditingLoading}
								/>
								<div className="flex gap-2">
									<Button
										size="sm"
										onClick={onSaveEdit}
										disabled={isEditingLoading || !editContent.trim()}
									>
										{isEditingLoading ? "Saving..." : "Save"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={onCancelEdit}
										disabled={isEditingLoading}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : (
							<p className="whitespace-pre-wrap">{message.content}</p>
						)}

						<div className="flex items-center justify-between mt-1">
							<p
								className={`text-[10px] ${
									isCurrentUser
										? "text-primary-foreground/70"
										: "text-muted-foreground"
								}`}
							>
								{new Date(message.createdAt).toLocaleTimeString()}
								{message.editedAt && <span className="ml-1">(edited)</span>}
							</p>
						</div>
					</div>

					{/* Action menu for current user's messages */}
					{isCurrentUser && !isEditing && (
						<div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0"
										disabled={isDeletingLoading}
									>
										<MoreVertical className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={onEdit}>
										<Edit2 className="h-3 w-3 mr-2" />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={onDelete}
										disabled={isDeletingLoading}
										className="text-destructive"
									>
										<Trash2 className="h-3 w-3 mr-2" />
										{isDeletingLoading ? "Deleting..." : "Delete"}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
