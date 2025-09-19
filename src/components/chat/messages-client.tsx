"use client";

import { useClerk } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPusherClient } from "@/lib/pusher/client";
import type { ThreadCreatedEvent } from "@/lib/pusher/server";
import { useTRPC } from "@/lib/trpc/react";
import { RealTimeMessages } from "./real-time-messages";

interface ThreadData {
	id: string;
	name: string | null;
	createdAt: Date;
	lastMessageAt: Date;
	participants: {
		id: string;
		username: string;
	}[];
}

interface Message {
	id: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	sender: {
		id: string;
		username: string;
	};
}

interface MessageCursor {
	id: string;
	createdAt: string;
}

interface MessagesClientProps {
	initialThreads: ThreadData[];
	selectedThreadId?: string;
	messages: Message[];
	nextCursor: MessageCursor | null;
	currentUser: {
		id: string;
		username: string;
		firstName: string | null;
		lastName: string | null;
		primaryEmail: string | null;
	};
	availableUsers: {
		id: string;
		username: string;
		firstName: string | null;
		lastName: string | null;
		primaryEmail: string | null;
	}[];
}

type AvailableUser = MessagesClientProps["availableUsers"][number];

function getThreadDisplayName(thread: ThreadData, currentUserId: string) {
	if (thread.name?.trim()) {
		return thread.name;
	}

	const others = thread.participants.filter((p) => p.id !== currentUserId);
	if (others.length === 0) {
		return "Direct message";
	}
	if (others.length === 1) {
		return `@${others[0]?.username ?? "unknown"}`;
	}
	if (others.length === 2) {
		return others.map((p) => `@${p.username}`).join(" & ");
	}
	const [first, second, ...rest] = others;
	const summary = [`@${first.username}`, `@${second?.username ?? ""}`]
		.filter(Boolean)
		.join(", ");
	return `${summary} +${rest.length}`;
}

export function MessagesClient({
	initialThreads,
	selectedThreadId,
	messages: initialMessages,
	nextCursor,
	currentUser,
	availableUsers,
}: MessagesClientProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isCreatingThread, setIsCreatingThread] = useState(false);
	const [threadName, setThreadName] = useState("");
	const [selectedParticipantIds, setSelectedParticipantIds] = useState<
		string[]
	>([]);
	const [creationError, setCreationError] = useState<string | null>(null);
	const [pendingThreadId, setPendingThreadId] = useState<string | undefined>(
		undefined,
	);

	const [isSigningOut, setIsSigningOut] = useState(false);

	const threadNameId = useId();

	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const threadsListQueryKey = useMemo(
		() => trpc.threads.list.queryKey(),
		[trpc.threads.list],
	);
	const { signOut } = useClerk();

	const threadsQuery = useQuery({
		...trpc.threads.list.queryOptions(),
		initialData: initialThreads,
	});
	const threadList = threadsQuery.data ?? initialThreads;
	const hasThreads = threadList.length > 0;
	const effectiveSelectedThreadId = pendingThreadId ?? selectedThreadId;
	const isPendingSelection =
		pendingThreadId !== undefined && pendingThreadId !== selectedThreadId;
	const selected = threadList.find((t) => t.id === effectiveSelectedThreadId);
	const selectedDisplayName = selected
		? getThreadDisplayName(selected, currentUser.id)
		: isPendingSelection
			? "Loading thread…"
			: hasThreads
				? "Select a thread"
				: "No conversations yet";

	useEffect(() => {
		if (!pendingThreadId) return;
		if (pendingThreadId === selectedThreadId) {
			setPendingThreadId(undefined);
		}
	}, [pendingThreadId, selectedThreadId]);

	useEffect(() => {
		const channelName = `user-${currentUser.id}`;
		const pusher = getPusherClient();
		const channel = pusher.subscribe(channelName);

		const handleThreadCreated = (payload: ThreadCreatedEvent) => {
			const normalizedThread: ThreadData = {
				id: payload.id,
				name: payload.name,
				createdAt: new Date(payload.createdAt),
				lastMessageAt: new Date(payload.lastMessageAt),
				participants: payload.participants,
			};

			queryClient.setQueryData<ThreadData[] | undefined>(
				threadsListQueryKey,
				(prev) => {
					const existing = prev ? [...prev] : [];
					const existingIndex = existing.findIndex(
						(thread) => thread.id === normalizedThread.id,
					);

					if (existingIndex === -1) {
						existing.push(normalizedThread);
					} else {
						existing[existingIndex] = normalizedThread;
					}

					existing.sort(
						(a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
					);

					return existing;
				},
			);
		};

		channel.bind("thread-created", handleThreadCreated);

		return () => {
			channel.unbind("thread-created", handleThreadCreated);
			pusher.unsubscribe(channelName);
		};
	}, [currentUser.id, queryClient, threadsListQueryKey]);

	// tRPC mutations

	const resetCreationState = () => {
		setThreadName("");
		setSelectedParticipantIds([]);
		setCreationError(null);
		setIsCreatingThread(false);
	};

	const createThreadMutation = useMutation(
		trpc.threads.create.mutationOptions({
			onSuccess: async (newThread) => {
				const participantDetails = [
					...selectedParticipantIds
						.map((id) => availableUsers.find((user) => user.id === id))
						.filter((user): user is AvailableUser => Boolean(user))
						.map((user) => ({ id: user.id, username: user.username })),
					{ id: currentUser.id, username: currentUser.username },
				];
				const newThreadEntry: ThreadData = {
					id: newThread.id,
					name: newThread.name ?? null,
					createdAt: new Date(newThread.createdAt),
					lastMessageAt: new Date(newThread.lastMessageAt),
					participants: participantDetails,
				};

				queryClient.setQueryData<ThreadData[] | undefined>(
					trpc.threads.list.queryKey(),
					(prev) => {
						if (!prev) {
							return [newThreadEntry];
						}
						if (prev.some((thread) => thread.id === newThreadEntry.id)) {
							return prev;
						}
						return [newThreadEntry, ...prev];
					},
				);

				resetCreationState();
				setIsDialogOpen(false);
				// Ensure thread list stays in sync with server ordering
				await queryClient
					.invalidateQueries({
						queryKey: trpc.threads.list.queryKey(),
					})
					.catch(() => undefined);
				// Redirect to the new thread without full reload
				setPendingThreadId(newThread.id);
				const destination = `/?thread=${newThread.id}`;
				try {
					router.push(destination);
				} catch (error) {
					console.error("Navigation failed", error);
					setPendingThreadId(selectedThreadId);
				}
			},
			onError: (error) => {
				console.error("Failed to create thread:", error);
				setIsCreatingThread(false);
				setCreationError(
					error instanceof Error
						? error.message
						: "Failed to create thread. Please try again.",
				);
			},
		}),
	);

	const handleCreateThread = async (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedParticipantIds.length === 0 || isCreatingThread) {
			if (selectedParticipantIds.length === 0) {
				setCreationError("Select at least one participant");
			}
			return;
		}
		setIsCreatingThread(true);
		setCreationError(null);
		try {
			await createThreadMutation.mutateAsync({
				name: threadName || undefined,
				participantIds: selectedParticipantIds,
			});
		} catch (error) {
			console.error("Failed to create thread:", error);
			setIsCreatingThread(false);
			setCreationError(
				"Something went wrong creating the thread. Please retry.",
			);
		}
	};

	const handleDialogOpenChange = (open: boolean) => {
		setIsDialogOpen(open);
		if (!open) {
			resetCreationState();
		}
	};

	const setParticipantSelection = (
		id: string,
		checked: boolean | "indeterminate",
	) => {
		setSelectedParticipantIds((prev) => {
			if (checked === true) {
				if (prev.includes(id)) {
					return prev;
				}
				return [...prev, id];
			}
			return prev.filter((existingId) => existingId !== id);
		});
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await signOut({ redirectUrl: "/sign-in" });
		} catch (error) {
			console.error("Failed to sign out:", error);
			setIsSigningOut(false);
		}
	};

	return (
		<div className="h-dvh grid grid-cols-[320px_1fr] gap-0">
			<aside className="border-r h-full flex flex-col">
				<div className="border-b p-4 space-y-4">
					<h2 className="text-lg font-semibold">Threads</h2>
					<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
						<DialogTrigger asChild>
							<Button className="w-full">New Thread</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg">
							<form onSubmit={handleCreateThread} className="space-y-4">
								<DialogHeader>
									<DialogTitle>Start a new thread</DialogTitle>
									<DialogDescription>
										Choose a name and participants for the conversation.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-3">
									<div className="space-y-2">
										<Label htmlFor={threadNameId}>Thread name (optional)</Label>
										<Input
											id={threadNameId}
											value={threadName}
											onChange={(e) => setThreadName(e.target.value)}
											placeholder="Give the thread a title"
											disabled={isCreatingThread}
										/>
									</div>
									<div className="space-y-2">
										<p className="text-sm font-medium">Participants</p>
										<ScrollArea className="h-56 rounded-md border">
											<ul className="divide-y">
												{availableUsers.length > 0 ? (
													availableUsers.map((user) => {
														const checkboxId = `participant-${user.id}`;
														const isChecked = selectedParticipantIds.includes(
															user.id,
														);
														return (
															<li key={user.id}>
																<label
																	htmlFor={checkboxId}
																	className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50"
																>
																	<Checkbox
																		id={checkboxId}
																		checked={isChecked}
																		onCheckedChange={(checked) =>
																			setParticipantSelection(user.id, checked)
																		}
																		disabled={isCreatingThread}
																	/>
																	<span className="text-sm font-medium">
																		@{user.username}
																	</span>
																	{isChecked ? (
																		<span className="ml-auto text-xs text-muted-foreground">
																			Added
																		</span>
																	) : null}
																</label>
															</li>
														);
													})
												) : (
													<li className="px-3 py-4 text-sm text-muted-foreground text-center">
														No other users available right now.
													</li>
												)}
											</ul>
										</ScrollArea>
										<p className="text-xs text-muted-foreground">
											Select at least one participant.
										</p>
									</div>
								</div>
								{creationError ? (
									<p className="text-xs text-red-500" role="alert">
										{creationError}
									</p>
								) : null}
								<DialogFooter>
									<DialogClose asChild>
										<Button
											type="button"
											variant="outline"
											disabled={isCreatingThread}
										>
											Cancel
										</Button>
									</DialogClose>
									<Button
										type="submit"
										disabled={
											isCreatingThread || selectedParticipantIds.length === 0
										}
									>
										{isCreatingThread ? "Creating..." : "Create thread"}
									</Button>
								</DialogFooter>
							</form>
						</DialogContent>
					</Dialog>
				</div>
				<ScrollArea className="flex-1">
					{hasThreads ? (
						<ul className="p-2">
							{threadList.map((thread) => {
								const isSelected = effectiveSelectedThreadId === thread.id;
								return (
									<li key={thread.id}>
										<Link
											href={`/?thread=${thread.id}`}
											className={`block px-3 py-2 rounded-md hover:bg-accent ${
												isSelected ? "bg-accent" : ""
											}`}
											scroll={false}
											onClick={(event) => {
												if (thread.id === selectedThreadId) {
													return;
												}
												event.preventDefault();
												setPendingThreadId(thread.id);
												const destination = `/?thread=${thread.id}`;
												try {
													router.push(destination);
												} catch (error) {
													console.error("Navigation failed", error);
													setPendingThreadId(selectedThreadId);
												}
											}}
										>
											<div className="flex items-center gap-3">
												<Avatar>
													<AvatarFallback>
														{getThreadDisplayName(thread, currentUser.id)
															.split(" ")
															.map((s) => s[0])
															.join("")
															.slice(0, 2)
															.toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<div className="min-w-0">
													<p className="truncate font-medium">
														{getThreadDisplayName(thread, currentUser.id)}
													</p>
													<p className="truncate text-xs text-muted-foreground">
														{new Date(thread.lastMessageAt).toLocaleString()}
													</p>
												</div>
											</div>
										</Link>
									</li>
								);
							})}
						</ul>
					) : (
						<div className="h-full flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
							<p className="text-sm">
								You haven’t started any conversations yet.
							</p>
							<Button onClick={() => setIsDialogOpen(true)}>New thread</Button>
						</div>
					)}
				</ScrollArea>
			</aside>

			<section className="h-full flex flex-col">
				<header className="h-14 border-b px-4 flex items-center justify-between">
					<div>
						<h3 className="font-semibold leading-none">
							{selectedDisplayName}
						</h3>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-xs text-green-600">● Connected</span>
						<Button
							variant="outline"
							size="sm"
							onClick={handleSignOut}
							disabled={isSigningOut}
						>
							{isSigningOut ? "Signing out..." : "Sign out"}
						</Button>
					</div>
				</header>

				{effectiveSelectedThreadId ? (
					isPendingSelection ? (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-muted-foreground">Loading thread…</p>
						</div>
					) : (
						<RealTimeMessages
							threadId={effectiveSelectedThreadId}
							initialMessages={initialMessages}
							initialNextCursor={nextCursor}
							currentUser={currentUser}
						/>
					)
				) : hasThreads ? (
					<div className="flex-1 flex items-center justify-center">
						<p className="text-muted-foreground">
							Select a thread to start messaging
						</p>
					</div>
				) : (
					<div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center text-muted-foreground">
						<div className="space-y-2">
							<h3 className="text-xl font-semibold text-foreground">
								Start your first conversation
							</h3>
							<p className="text-sm">
								Invite teammates or customers to begin chatting. You can create
								a new thread at any time.
							</p>
						</div>
						<Button onClick={() => setIsDialogOpen(true)}>
							Create a thread
						</Button>
					</div>
				)}
			</section>
		</div>
	);
}
