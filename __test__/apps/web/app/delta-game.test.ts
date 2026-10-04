import {describe, expect, it} from 'vitest';
import {acceptDelta, activePath, addGeneratedEvidence, canUseAnchor, contestDelta, createGame, draftIssues, restoreGame, revertTo} from '../../../../apps/web/app/poc/sanity/game/game-model';
import {initialEvidence} from '../../../../apps/web/app/poc/sanity/game/game-evidence';

const draft = {question: 'What caused checkout failures?', hypothesis: 'The timeout interacted with latency.', evidenceIds: ['01-deployment-record.md'], rationale: 'The release shortened the timeout.', conclusion: 'Investigate the interaction; cause remains uncertain.', closesCase: false};

describe('browser-local Delta investigation', () => {
  it('requires player-owned hypothesis, evidence, rationale, and conclusion', () => {
    expect(draftIssues(createGame(initialEvidence), {...draft, rationale: '', evidenceIds: []})).toHaveLength(2);
    expect(() => acceptDelta(createGame(initialEvidence), {...draft, evidenceIds: ['fabricated']})).toThrow();
  });
  it('creates immutable steps and reopens a player-closed case through a new Delta', () => {
    const original = createGame(initialEvidence);
    const first = acceptDelta(original, {...draft, closesCase: true});
    const second = acceptDelta(first, draft);
    expect(original.deltas).toHaveLength(0);
    expect(first.deltas[0]?.closesCase).toBe(true);
    expect(second.deltas[1]?.parentId).toBe('D01');
    expect(second.deltas[1]?.closesCase).toBe(false);
  });
  it('reverts and branches without deleting the previous conclusion', () => {
    const original = acceptDelta(acceptDelta(createGame(initialEvidence), draft), {...draft, conclusion: 'Second explanation.'});
    const fork = acceptDelta(revertTo(original, 'D01'), {...draft, conclusion: 'Alternative explanation.'});
    expect(fork.deltas.map(delta => delta.parentId)).toEqual([null, 'D01', 'D01']);
    expect(activePath(fork).map(delta => delta.id)).toEqual(['D01', 'D03']);
    expect(fork.deltas[1]?.conclusion).toBe('Second explanation.');
    expect(fork.events.map(event => event.type)).toEqual(['accepted', 'accepted', 'reverted', 'accepted']);
  });
  it('contesting an ancestor rolls back affected descendants while retaining history', () => {
    const state = acceptDelta(acceptDelta(createGame(initialEvidence), draft), draft);
    const contested = contestDelta(state, 'D01', 'New evidence challenges the assumption.');
    expect(contested.headId).toBeNull();
    expect(contested.deltas).toHaveLength(2);
    expect(canUseAnchor(contested, 'D02')).toBe(false);
    expect(() => acceptDelta(contested, draft, 'D01')).toThrow();
    expect(acceptDelta(contested, draft).deltas[2]?.parentId).toBeNull();
  });
  it('contesting a sibling does not move the current branch', () => {
    const state = acceptDelta(revertTo(acceptDelta(acceptDelta(createGame(initialEvidence), draft), draft), 'D01'), draft);
    expect(contestDelta(state, 'D02', 'Disagree with that branch.').headId).toBe('D03');
  });
  it('labels live generated context separately and does not mutate existing evidence', () => {
    const original = createGame(initialEvidence);
    const next = addGeneratedEvidence(original, 'Search context', 'Generated interpretation', 'What changed?');
    expect(original.evidence).toHaveLength(6);
    expect(next.evidence.at(-1)?.kind).toBe('generated-context');
    expect(next.evidence.at(-1)?.provenance).toContain('not verified original');
  });
  it('restores a valid notebook and rejects corrupt graphs and missing source references', () => {
    const state = acceptDelta(createGame(initialEvidence), draft);
    expect(restoreGame(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(restoreGame({...state, headId: 'missing'})).toBeNull();
    expect(restoreGame({...state, deltas: [{...state.deltas[0], parentId: 'D01'}]})).toBeNull();
    expect(restoreGame({...state, evidence: []})).toBeNull();
    expect(restoreGame({version: 999})).toBeNull();
  });
  it('replays accepted, reverted, branched, and contested history to verify the active head', () => {
    const first = acceptDelta(createGame(initialEvidence), draft);
    const second = acceptDelta(first, draft);
    const branched = acceptDelta(revertTo(second, 'D01'), {...draft, conclusion: 'Alternative explanation.'});
    const contested = contestDelta(branched, 'D03', 'A new record challenges this explanation.');
    expect(restoreGame(JSON.parse(JSON.stringify(contested)))).toEqual(contested);
    expect(restoreGame({...contested, headId: 'D02'})).toBeNull();
    expect(restoreGame({...first, events: []})).toBeNull();
    expect(restoreGame({...first, events: [...first.events, {...first.events[0], id: 'E2'}]})).toBeNull();
  });
  it('rejects events before acceptance, reverting to contested ancestry, and duplicate contest events', () => {
    const first = acceptDelta(createGame(initialEvidence), draft);
    const contested = contestDelta(first, 'D01', 'New information undermines the explanation.');
    expect(restoreGame({...first, events: [{id: 'E1', type: 'reverted', deltaId: 'D01', reason: 'Before acceptance.'}]})).toBeNull();
    expect(restoreGame({...contested, events: [...contested.events, {id: 'E3', type: 'reverted', deltaId: 'D01', reason: 'Invalid return.'}]})).toBeNull();
    expect(restoreGame({...contested, events: [...contested.events, {...contested.events[1], id: 'E3'}]})).toBeNull();
    expect(restoreGame({...first, events: [{...first.events[0], reason: ''}]})).toBeNull();
    expect(restoreGame({...first, events: [{...first.events[0], type: 'invented'}]})).toBeNull();
  });
});
