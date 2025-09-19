import { messagesRouter } from "./routers/messages";
import { threadsRouter } from "./routers/threads";
import { usersRouter } from "./routers/users";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	users: usersRouter,
	threads: threadsRouter,
	messages: messagesRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
export type CreateCaller = typeof createCaller;
