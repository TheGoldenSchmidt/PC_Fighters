import { z } from 'zod';

const index = z.number().int().nonnegative().max(10000);
const lane = z.number().int().min(0).max(4);
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('surrender') }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
  z.object({ type: z.literal('flyDone') }).strict(),
  z.object({ type: z.literal('mulligan'), handIndices: z.array(index).max(10) }).strict(),
  z.object({ type: z.literal('playCreature'), handIndex: index, lane }).strict(),
  z.object({ type: z.literal('playEnvironment'), handIndex: index, lane }).strict(),
  z.object({ type: z.literal('playAction'), handIndex: index, targetLane: z.number().int().min(-1).max(4).optional(), toLane: lane.optional(), targetUid: id.optional(), secondUid: id.optional(), handInstanceId: id.optional(), graveId: id.optional() }).strict(),
  z.object({ type: z.literal('flyMove'), fromLane: lane, toLane: lane, targetUid: id.optional() }).strict(),
  z.object({ type: z.literal('chooseCard'), choiceId: id, instanceId: id }).strict(),
  z.object({ type: z.literal('cheerleaderReaction'), reactionId: id, slot: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]), choice: z.enum(['A', 'B']).optional() }).strict(),
]);
const name = z.string().min(1).max(120);
const selection = z.object({ kind: z.literal('preset'), id: name }).strict();
const entry = { championId: name.optional(), faction: name.optional(), deckSelection: selection.optional(), username: name.nullable().optional() };
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), ...entry, topic: name.optional(), lanes: z.literal(5).optional(), testMode: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('join'), ...entry, code: z.string().regex(/^\d{4}$/) }).strict(),
  z.object({ type: z.literal('rejoin'), code: z.string().regex(/^\d{4}$/), token: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal('rematchReady'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('action'), revision: index, action: actionSchema }).strict(),
]);
