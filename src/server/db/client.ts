import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "./schemas";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

export const db = drizzle(databaseUrl, {
	schema,
	logger: process.env.DRIZZLE_LOG_QUERIES === "true",
});
