import { messages, messagesRelations } from "./messages";
import {
	threadParticipants,
	threadParticipantsRelations,
} from "./thread-participants";
import { threads, threadsRelations } from "./threads";
import { users, usersRelations } from "./users";

export {
	type Message,
	messages,
	messagesRelations,
	type NewMessage,
} from "./messages";
export {
	type NewThreadParticipant,
	type ThreadParticipant,
	threadParticipants,
	threadParticipantsRelations,
} from "./thread-participants";
export {
	type NewThread,
	type Thread,
	threads,
	threadsRelations,
} from "./threads";
export {
	type NewUser,
	type User,
	users,
	usersRelations,
} from "./users";

export const schema = {
	users,
	threads,
	messages,
	threadParticipants,
	usersRelations,
	threadsRelations,
	messagesRelations,
	threadParticipantsRelations,
};
