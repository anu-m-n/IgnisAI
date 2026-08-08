// Simple in-memory session store.
// Persistent accounts are explicitly out of scope per the spec, so this is
// intentionally not backed by a database. State lives for the life of the
// process and is keyed by sessionId.

const sessions = new Map();

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function createSession(sessionId, initialState) {
  const state = { ...initialState, createdAt: Date.now() };
  sessions.set(sessionId, state);
  return state;
}

export function updateSession(sessionId, patch) {
  const current = sessions.get(sessionId);
  if (!current) throw new Error(`No session found for ${sessionId}`);
  const next = { ...current, ...patch };
  sessions.set(sessionId, next);
  return next;
}

export function deleteSession(sessionId) {
  sessions.delete(sessionId);
}
