import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center">
			<div className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">404</p>
				<h1 className="text-3xl font-semibold tracking-tight">
					Page not found
				</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					The page you are looking for has moved or no longer exists. Head back
					to your inbox to keep the conversation going.
				</p>
			</div>
			<Button asChild>
				<Link href="/">Return home</Link>
			</Button>
		</div>
	);
}
