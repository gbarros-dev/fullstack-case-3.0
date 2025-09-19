"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
	return (
		<div className="min-h-dvh flex items-center justify-center p-6">
			<div className="w-full max-w-md">
				<SignIn />
			</div>
		</div>
	);
}
