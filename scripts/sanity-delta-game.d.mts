import type {NativeDemoAdapters} from './sanity-kb-native-demo.mjs'
export interface GameClue {id:string;title:string;text:string;provenance:string;kind:'frozen-source'|'generated-context';receipt?:string}
export interface GameClueResult {questionId:string;question:string;clues:GameClue[];search:{arguments:{knowledgeBase:string;query:string;return:'entries';limit:number};text:string};modelCalls:0}
export interface GameReview {verdict:'supported'|'partial'|'contradicted'|'insufficient';rationale:string;limitations:string;nextCheck:string;evidenceIds:string[]}
export interface GameReviewResult {review:GameReview;model:string;usage:{inputTokens:number;outputTokens:number}|null;latencyMs:number}
export interface GameSelection {hypothesis:{id:string;code:string;label:string;text:string};evidence:GameClue[];question:string}
export function nativeContextClues(text:string,options:{query:string;receiptKey:string;now?:number}):GameClue[]
export function verifyClueReceipt(item:unknown,key:string,now?:number):boolean
export function validateGameSelection(input:unknown,starterEvidence:GameClue[],receiptKey:string,now?:number):GameSelection
export function retrieveGameClues(questionId:string,adapters:Pick<NativeDemoAdapters,'searchKnowledgeBase'>,options:{receiptKey:string;now?:number}):Promise<GameClueResult>
export function reviewGameSelection(selection:GameSelection,adapters:Pick<NativeDemoAdapters,'generateJson'>):Promise<GameReviewResult>
