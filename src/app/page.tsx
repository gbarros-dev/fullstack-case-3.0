import { auth } from "@clerk/nextjs/server";
import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { redirect } from "next/navigation";
import { MessagesClient } from "@/components/chat/messages-client";
import { HydrateClient, trpc } from "@/lib/trpc/server";

type PageProps = { searchParams?: Promise<{ thread?: string }> };

export default async function HomePage({ searchParams }: PageProps) {
	const { userId } = await auth();
	if (!userId) {
		redirect("/sign-in");
	}

	const resolvedSearchParams = await searchParams;

	const queryClient = new QueryClient();

	const currentUser = await queryClient.fetchQuery(
		trpc.users.me.queryOptions(),
	);

	const threads = await queryClient.fetchQuery(
		trpc.threads.list.queryOptions(),
	);

	const availableUsers = await queryClient.fetchQuery(
		trpc.users.getAll.queryOptions(),
	);

	const requestedThreadId = resolvedSearchParams?.thread;
	const hasRequestedThread = requestedThreadId
		? threads.some((thread) => thread.id === requestedThreadId)
		: true;

	if (requestedThreadId && !hasRequestedThread) {
		redirect("/");
	}

	const selectedThreadId = requestedThreadId ?? threads[0]?.id;

	const messages = selectedThreadId
		? await (async () => {
				try {
					return await queryClient.fetchQuery(
						trpc.messages.list.queryOptions({
							threadId: selectedThreadId,
							limit: 50,
						}),
					);
				} catch (error) {
					const code =
						error instanceof TRPCClientError
							? error.data?.code
							: typeof error === "object" && error !== null && "data" in error
								? (error as { data?: { code?: string } }).data?.code
								: undefined;

					if (code === "NOT_FOUND") {
						redirect("/");
					}

					throw error;
				}
			})()
		: { messages: [], nextCursor: null };

	return (
		<HydrateClient>
			<MessagesClient
				initialThreads={threads}
				selectedThreadId={selectedThreadId}
				messages={messages.messages}
				nextCursor={messages.nextCursor}
				currentUser={currentUser}
				availableUsers={availableUsers}
			/>
		</HydrateClient>
	);
}
