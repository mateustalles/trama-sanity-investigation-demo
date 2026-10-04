// Manually frozen from question wording and shared incident context, before
// native search. Never import structuredSpecs, source gold, or expected facts.
export const queryRevision = 'manual-keywords-v1'
export const incidentContext = 'checkout payment incident September 18 2026'
export const questionTerms = Object.freeze({
  R01:'investigated event interval UTC',
  R02:'checkout configuration change before event old new values',
  R03:'Provider A p95 latency before during',
  R04:'initial failure successful retries delay',
  R05:'failed payments address sample succeeded address edit',
  R06:'fraud configuration audit 08:00 12:00 UTC',
  R07:'Provider A regional status notice publication',
  R08:'old monitoring change another case',
  I01:'candidate explanations hypothesis evidence strongest weakest',
  I02:'primary records mechanism timing root cause uncertainty',
  I03:'address validation explanation observations counterevidence',
  I04:'fraud configuration explanation observations counterevidence',
  I05:'Provider A temporal overlap failures attribution causality',
  I06:'successful retries transient failure causality limitations',
  I07:'Provider A numerical share failures attribution evidence missing',
  I08:'release record latency observation complementary evidence',
  I09:'fraud system conclusion uncertainty',
  I10:'postal code validation conclusion uncertainty',
  T01:'Provider A maintenance July September separate event',
  T02:'Provider B timeout September 2 2026 separate event',
  T03:'Provider C latency 11:00 event chronology',
  T04:'checkout cache regression September 10 2026 separate case',
  T05:'fraud tuning proposal after event earlier failures chronology',
  T06:'postal code migration June September release regression',
  T07:'vendor status notice transaction root cause evidence',
  T08:'monitoring artifact other case payments scope',
  S01:'current case state revision status',
  S02:'latest delta status base revision',
  S03:'latest monitoring follow up delta proposed applied state',
  S04:'applied deltas snapshot base revisions count',
  S05:'new delta base revision 1 current state revision',
  S06:'incident evidence authoritative state delta applied',
  D01:'monitoring follow up latency timeout draft approval',
  D02:'Provider A attribution quantify question transaction evidence',
  D03:'root cause confirmation evidence approval uncertainty',
  D04:'next investigation step uncertainty provenance missing evidence',
  D05:'old catalog cache delta payments draft alternative',
  D06:'investigation strongest hypothesis counterevidence uncertainty',
  X01:'release timeout Provider A latency postal fraud counterevidence mechanism uncertainty',
  X02:'current payment case latest monitoring delta applied old catalog cache authoritative state',
})

export function queryForCase(id) {
  if (!Object.hasOwn(questionTerms,id)) throw new Error(`No predeclared query for ${id}.`)
  return `${incidentContext} ${questionTerms[id]}`
}
