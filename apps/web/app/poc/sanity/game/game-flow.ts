import {gameQuestions,gameHypotheses} from '../../../../../../scripts/sanity-game-options.mjs';
import {activePath, type DeltaDraft, type Evidence, type GameState} from './game-model';

export type GamePanel = 'issue'|'clues'|'hypothesis'|'rationale'|'confirm'|'history'|'brief'|'usage'|null;

export function freshDraft(questionId = ''): DeltaDraft {
  const question = gameQuestions.find(item => item.id === questionId);
  if (questionId && !question) throw new Error('Choose a known investigation question.');
  return {question: question?.question ?? '', hypothesis:'', evidenceIds:[], rationale:'', conclusion:'', closesCase:false};
}

/** Explored is not resolved. Only the active branch influences the next suggestions. */
export function exploredQuestionIds(state: GameState): Set<string> {
  const questions = new Set(activePath(state).map(delta => delta.question));
  return new Set(gameQuestions.filter(item => questions.has(item.question)).map(item => item.id));
}

/** Archived evidence never substitutes for a live packet in a new draft. */
export function currentClues(packet: {clues: Evidence[]} | null): Evidence[] {
  return packet?.clues ?? [];
}

export function toggleClue(draft: DeltaDraft, id: string, clues: Evidence[]): DeltaDraft {
  if (!clues.some(item => item.id === id)) throw new Error('Retrieve this clue for the current question first.');
  const selected = draft.evidenceIds.includes(id);
  if (!selected && draft.evidenceIds.length >= 10) throw new Error('Select at most ten clues for this Delta.');
  return {...draft, evidenceIds:selected ? draft.evidenceIds.filter(value => value !== id) : [...draft.evidenceIds,id], rationale:'', conclusion:'', closesCase:false};
}

export function canReviewSelection(questionId:string, hypothesisId:string, draft:DeltaDraft, clues:Evidence[]):boolean {
  return Boolean(gameQuestions.some(item=>item.id===questionId) && gameHypotheses.some(item=>item.id===hypothesisId) && draft.hypothesis.trim()
    && draft.evidenceIds.length>0 && draft.evidenceIds.length<=10
    && new Set(draft.evidenceIds).size===draft.evidenceIds.length
    && draft.evidenceIds.every(id=>clues.some(item=>item.id===id)));
}
