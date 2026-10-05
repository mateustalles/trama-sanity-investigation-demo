import {suggestedQuestions,advancedQuestions} from './sanity-demo-prompts.mjs'

export const gameQuestions = Object.freeze([...suggestedQuestions,...advancedQuestions])
export const gameHypotheses = Object.freeze([
  {id:'timeout-latency',code:'A',label:'Timeout × latency',text:'A shorter request timeout interacting with provider latency contributed to checkout failures.'},
  {id:'postal-validation',code:'B',label:'Postal-code validation',text:'A postal-code validation change rejecting legitimate payment attempts contributed to checkout failures.'},
  {id:'fraud-change',code:'C',label:'Fraud-rule change',text:'A fraud-rule configuration change rejecting legitimate payment attempts contributed to checkout failures.'},
])
export const gameConclusions = Object.freeze([
  {id:'supported',label:'Best supported',text:'This is the best-supported explanation in my selected material, not a proven sole root cause.'},
  {id:'plausible',label:'Still plausible',text:'This remains a plausible hypothesis; the selected material does not yet establish causality.'},
  {id:'insufficient',label:'Not enough evidence',text:'The selected material is insufficient to support this explanation; the investigation remains open.'},
])
export const gameQuestion = 'What best explains the September 18 checkout failures, and what remains unproven?'
