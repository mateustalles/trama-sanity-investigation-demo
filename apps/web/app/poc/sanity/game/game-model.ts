export type Evidence = {
  id: string; title: string; text: string; provenance: string;
  kind: 'frozen-source' | 'generated-context';
};
export type Delta = {
  id: string; parentId: string | null; question: string; hypothesis: string;
  evidenceIds: string[]; rationale: string; conclusion: string; closesCase: boolean;
};
export type GameEvent = {id: string; type: 'accepted' | 'reverted' | 'contested'; deltaId: string; reason: string};
export type GameState = {version: 1; evidence: Evidence[]; deltas: Delta[]; events: GameEvent[]; headId: string | null};
export type DeltaDraft = Omit<Delta, 'id' | 'parentId'>;

export function createGame(evidence: Evidence[]): GameState {
  return {version: 1, evidence: evidence.map(item => ({...item})), deltas: [], events: [], headId: null};
}

export function resetLocalNotebook(state: GameState, initialEvidence: Evidence[], confirmed: boolean): GameState {
  // Requesting or cancelling reset is non-destructive; only explicit confirmation
  // replaces the local notebook. This never targets operational Case State.
  return confirmed ? createGame(initialEvidence) : state;
}

export function isContested(state: GameState, id: string): boolean {
  return state.events.some(event => event.type === 'contested' && event.deltaId === id);
}

export function activePath(state: GameState, id: string | null = state.headId): Delta[] {
  const path: Delta[] = [];
  while (id) {
    const node = state.deltas.find(delta => delta.id === id);
    if (!node || path.some(delta => delta.id === id)) throw new Error('Invalid Delta path.');
    path.unshift(node); id = node.parentId;
  }
  return path;
}

export function canUseAnchor(state: GameState, id: string | null): boolean {
  try { return activePath(state, id).every(delta => !isContested(state, delta.id)); }
  catch { return false; }
}

export function draftIssues(state: GameState, draft: DeltaDraft): string[] {
  const issues: string[] = [];
  for (const key of ['question', 'hypothesis', 'rationale', 'conclusion'] as const) {
    if (!draft[key].trim()) issues.push(`Add a ${key}.`);
    if (draft[key].length > 4000) issues.push(`Keep ${key} under 4,000 characters.`);
  }
  if (!draft.evidenceIds.length) issues.push('Select at least one piece of evidence.');
  if (new Set(draft.evidenceIds).size !== draft.evidenceIds.length || draft.evidenceIds.some(id => !state.evidence.some(item => item.id === id))) issues.push('Select valid, distinct evidence.');
  return issues;
}

export function acceptDelta(state: GameState, draft: DeltaDraft, parentId = state.headId): GameState {
  const issues = draftIssues(state, draft);
  if (issues.length) throw new Error(issues.join(' '));
  if (!canUseAnchor(state, parentId)) throw new Error('Choose an uncontested branch point.');
  if (state.deltas.length >= 200) throw new Error('This local session has reached 200 Deltas. Export it and start a new session.');
  const id = `D${String(state.deltas.length + 1).padStart(2, '0')}`;
  const delta: Delta = {...draft, evidenceIds: [...draft.evidenceIds], id, parentId};
  return {...state, deltas: [...state.deltas, delta], headId: id,
    events: [...state.events, {id: `E${state.events.length + 1}`, type: 'accepted', deltaId: id, reason: 'Player accepted this Delta.'}]};
}

export function revertTo(state: GameState, id: string): GameState {
  if (!state.deltas.some(delta => delta.id === id) || !canUseAnchor(state, id)) throw new Error('Choose an uncontested Delta.');
  return {...state, headId: id, events: [...state.events,
    {id: `E${state.events.length + 1}`, type: 'reverted', deltaId: id, reason: 'Player returned to this branch point; later Deltas were preserved.'}]};
}

export function contestDelta(state: GameState, id: string, reason: string): GameState {
  const delta = state.deltas.find(node => node.id === id);
  if (!delta || isContested(state, id)) throw new Error('Choose an uncontested Delta.');
  if (!reason.trim() || reason.length > 4000) throw new Error('Explain why this Delta is contested (under 4,000 characters).');
  const affectsHead = activePath(state).some(node => node.id === id);
  return {...state, headId: affectsHead ? delta.parentId : state.headId,
    events: [...state.events, {id: `E${state.events.length + 1}`, type: 'contested', deltaId: id, reason: reason.trim()}]};
}

export function addGeneratedEvidence(state: GameState, title: string, text: string, query: string): GameState {
  if (!text.trim() || text.length > 100000 || state.evidence.length >= 60) throw new Error('Generated context is empty or this local evidence notebook is full.');
  return {...state, evidence: [...state.evidence, {id: `KB${state.evidence.length + 1}`, title: title.slice(0, 180), text,
    provenance: `Live native Knowledge Base search. Question: ${query.slice(0, 600)}. Generated interpretation, not verified original evidence.`, kind: 'generated-context'}]};
}

export function restoreGame(value: unknown): GameState | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const state = value as GameState;
    if (state.version !== 1 || !Array.isArray(state.evidence) || !Array.isArray(state.deltas) || !Array.isArray(state.events)
      || state.evidence.length > 60 || state.deltas.length > 200 || state.events.length > 2000
      || !(state.headId === null || typeof state.headId === 'string')) return null;
    const strings = (...items: unknown[]) => items.every(item => typeof item === 'string');
    if (state.evidence.some(item => !item || !strings(item.id, item.title, item.text, item.provenance)
      || item.text.length > 100000 || !['frozen-source', 'generated-context'].includes(item.kind))) return null;
    if (new Set(state.evidence.map(item => item.id)).size !== state.evidence.length) return null;
    const ids = new Set<string>();
    for (const [index, delta] of state.deltas.entries()) {
      if (!delta || !strings(delta.id, delta.question, delta.hypothesis, delta.rationale, delta.conclusion)
        || delta.id !== `D${String(index + 1).padStart(2, '0')}` || ids.has(delta.id) || !(delta.parentId === null || ids.has(delta.parentId))
        || typeof delta.closesCase !== 'boolean' || !Array.isArray(delta.evidenceIds)
        || draftIssues(state, delta).length) return null;
      ids.add(delta.id);
    }
    // Restore only histories that could have been produced by this game. A valid
    // graph alone is insufficient: forged or out-of-order events must not silently
    // un-contest a branch, accept the same Delta twice, or invent a current head.
    let replay: GameState = {...state, deltas: [], events: [], headId: null};
    for (const [index, event] of state.events.entries()) {
      if (!event || event.id !== `E${index + 1}` || !strings(event.id, event.reason)
        || !event.reason.trim() || event.reason.length > 4000 || !ids.has(event.deltaId)) return null;
      if (event.type === 'accepted') {
        const delta = state.deltas[replay.deltas.length];
        if (!delta || event.deltaId !== delta.id || !canUseAnchor(replay, delta.parentId)) return null;
        replay = {...replay, deltas: [...replay.deltas, delta], headId: delta.id};
      } else if (event.type === 'reverted') {
        if (!replay.deltas.some(delta => delta.id === event.deltaId) || !canUseAnchor(replay, event.deltaId)) return null;
        replay = {...replay, headId: event.deltaId};
      } else if (event.type === 'contested') {
        const delta = replay.deltas.find(node => node.id === event.deltaId);
        if (!delta || isContested(replay, event.deltaId)) return null;
        if (activePath(replay).some(node => node.id === delta.id)) replay = {...replay, headId: delta.parentId};
      } else return null;
      replay = {...replay, events: [...replay.events, event]};
    }
    if (replay.deltas.length !== state.deltas.length || replay.headId !== state.headId || !canUseAnchor(state, state.headId)) return null;
    return state;
  } catch { return null; }
}
