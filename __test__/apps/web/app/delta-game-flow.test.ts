import {describe,expect,it} from 'vitest';
import {gameQuestions} from '../../../../scripts/sanity-game-options.mjs';
import {canReviewSelection,currentClues,exploredQuestionIds,freshDraft,toggleClue} from '../../../../apps/web/app/poc/sanity/game/game-flow';
import {acceptDelta,contestDelta,createGame,restoreGame,revertTo,type Evidence} from '../../../../apps/web/app/poc/sanity/game/game-model';
import {initialEvidence} from '../../../../apps/web/app/poc/sanity/game/game-evidence';

const clues:Evidence[]=Array.from({length:11},(_,i)=>({id:`clue-${i}`,title:`Clue ${i}`,text:'Complete context',provenance:'Sanity-generated context',kind:'generated-context',receipt:'receipt'}));
const validDraft=(questionId:string)=>({...freshDraft(questionId),hypothesis:'A qualified explanation',evidenceIds:['clue-0'],rationale:'Supporting connection, with limits.',conclusion:'Still provisional.'});

describe('issue-first orbit UI flow',()=>{
  it('starts without a question, clues or prefilled decisions',()=>{
    expect(freshDraft()).toEqual({question:'',hypothesis:'',evidenceIds:[],rationale:'',conclusion:'',closesCase:false});
    expect(createGame([]).evidence).toEqual([]);
    expect(currentClues(null)).toEqual([]);
  });
  it('uses known questions and clears the entire draft for a new line of inquiry',()=>{
    expect(freshDraft('timeline').question).toBe(gameQuestions.find(item=>item.id==='timeline')?.question);
    expect(freshDraft('change').evidenceIds).toEqual([]);
    expect(()=>freshDraft('invented')).toThrow('known investigation question');
  });
  it('never uses archived or frozen clues as a new live packet fallback',()=>{
    const archived=createGame(initialEvidence);
    expect(archived.evidence).toHaveLength(6);
    expect(currentClues(null)).toEqual([]);
    expect(currentClues({clues})).toBe(clues);
    expect(restoreGame(JSON.parse(JSON.stringify(archived)))).toEqual(archived);
  });
  it('counts only accepted questions on the active branch, not discarded siblings',()=>{
    const first=acceptDelta(createGame(clues),validDraft('timeline'));
    const second=acceptDelta(first,validDraft('change'));
    const sibling=acceptDelta(revertTo(second,'D01'),validDraft('alternatives'));
    expect([...exploredQuestionIds(sibling)].sort()).toEqual(['alternatives','timeline']);
    expect(sibling.deltas).toHaveLength(3);
    expect(restoreGame(JSON.parse(JSON.stringify(sibling)))).toEqual(sibling);
  });
  it('returns affected questions to the suggestions after contestation',()=>{
    const state=acceptDelta(acceptDelta(createGame(clues),validDraft('timeline')),validDraft('change'));
    const contested=contestDelta(state,'D01','New context undermines this assumption.');
    expect([...exploredQuestionIds(contested)]).toEqual([]);
    expect(contested.deltas).toHaveLength(2);
  });
  it('does not misclassify legacy questions as solved preset issues',()=>{
    const state=acceptDelta(createGame(clues),{...validDraft('timeline'),question:'A question from the previous UI.'});
    expect(exploredQuestionIds(state).size).toBe(0);
  });
  it('invalidates rationale and conclusion when a clue selection changes',()=>{
    const draft={...validDraft('timeline'),closesCase:true};
    const next=toggleClue(draft,'clue-1',clues);
    expect(next.evidenceIds).toEqual(['clue-0','clue-1']);
    expect(next.rationale).toBe('');expect(next.conclusion).toBe('');expect(next.closesCase).toBe(false);
    expect(draft.rationale).not.toBe('');
    expect(toggleClue(next,'clue-1',clues).evidenceIds).toEqual(['clue-0']);
  });
  it('enforces ten current clues while allowing deselection at the limit',()=>{
    const draft={...validDraft('timeline'),evidenceIds:clues.slice(0,10).map(item=>item.id)};
    expect(()=>toggleClue(draft,'clue-10',clues)).toThrow('at most ten');
    expect(toggleClue(draft,'clue-0',clues).evidenceIds).toHaveLength(9);
    expect(()=>toggleClue(draft,'archived',clues)).toThrow('current question');
  });
  it('requires a known question, hypothesis and current distinct clues before review',()=>{
    const draft=validDraft('timeline');
    expect(canReviewSelection('timeline','timeout-latency',draft,clues)).toBe(true);
    expect(canReviewSelection('','timeout-latency',draft,clues)).toBe(false);
    expect(canReviewSelection('timeline','',draft,clues)).toBe(false);
    expect(canReviewSelection('timeline','invented',draft,clues)).toBe(false);
    expect(canReviewSelection('timeline','timeout-latency',draft,[])).toBe(false);
    expect(canReviewSelection('timeline','timeout-latency',{...draft,evidenceIds:['clue-0','clue-0']},clues)).toBe(false);
    expect(canReviewSelection('timeline','timeout-latency',{...draft,evidenceIds:[]},clues)).toBe(false);
  });
});
