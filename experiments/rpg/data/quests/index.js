// Quest registry. Every authored quest is listed here (every save contains all of them).
import aCleanBreak from './a_clean_break.js';

export const QUESTS = [aCleanBreak];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
