export type SeedUser = {
	email: string;
	password: string;
	username: string;
	firstName: string;
	lastName: string;
};

export const seedUsers: SeedUser[] = [
	{
		email: "alice@example.com",
		password: "AlicePass123!",
		username: "alice",
		firstName: "Alice",
		lastName: "Johnson",
	},
	{
		email: "bob@example.com",
		password: "BobPass123!",
		username: "bobby",
		firstName: "Bob",
		lastName: "Thompson",
	},
	{
		email: "charlie@example.com",
		password: "CharliePass123!",
		username: "charlie",
		firstName: "Charlie",
		lastName: "Nguyen",
	},
	{
		email: "diana@example.com",
		password: "DianaPass123!",
		username: "diana",
		firstName: "Diana",
		lastName: "Martinez",
	},
	{
		email: "eve@example.com",
		password: "EvePass123!",
		username: "evee",
		firstName: "Eve",
		lastName: "Singh",
	},
];
