import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
	"/sign-in(.*)",
	"/api/trpc(.*)",
	"/api/auth(.*)",
	"/api/clerk-webhooks(.*)",
	"/public(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
	if (!isPublicRoute(request)) {
		await auth.protect();
	}
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
