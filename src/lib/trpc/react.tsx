"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createTRPCClient,
	httpBatchStreamLink,
	loggerLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import SuperJSON from "superjson";
import type { AppRouter } from "@/server/api";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = () => {
	if (typeof window === "undefined") {
		// Server: always make a new query client
		return createQueryClient();
	}
	// Browser: use singleton pattern to keep the same query client
	if (clientQueryClientSingleton === undefined) {
		clientQueryClientSingleton = createQueryClient();
	}
	return clientQueryClientSingleton as QueryClient;
};

export const { useTRPC, TRPCProvider } = createTRPCContext<AppRouter>();

export function TRPCReactProvider(props: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	const [trpcClient] = useState(() =>
		createTRPCClient<AppRouter>({
			links: [
				loggerLink({
					enabled: (op) =>
						process.env.NODE_ENV === "development" ||
						(op.direction === "down" && op.result instanceof Error),
				}),
				httpBatchStreamLink({
					transformer: SuperJSON,
					url: `${getBaseUrl()}/api/trpc`,
					headers() {
						const headers = new Headers();
						headers.set("x-trpc-source", "nextjs-react");

						// Add organization ID from localStorage for organization switching
						if (typeof window !== "undefined") {
							const currentOrganizationId = localStorage.getItem(
								"current-organization-id",
							);
							if (currentOrganizationId && currentOrganizationId !== "null") {
								headers.set(
									"x-organization-id",
									JSON.parse(currentOrganizationId),
								);
							}
						}

						return headers;
					},
				}),
			],
		}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
				{props.children}
			</TRPCProvider>
		</QueryClientProvider>
	);
}

const getBaseUrl = () => {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}
	if (process.env.VERCEL_URL) {
		return `https://${process.env.VERCEL_URL}`;
	}

	// eslint-disable-next-line no-restricted-properties
	return `http://localhost:${process.env.PORT ?? 3030}`;
};
