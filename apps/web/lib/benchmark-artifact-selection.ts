/** Keep each benchmark file intact, even when case, arm, and repetition match. */
export function retainArtifactResults<T extends object>(runs: readonly {name: string; results: readonly T[]}[]): Array<T & {artifact: string}> {
  return runs.flatMap((run) => run.results.map((result) => ({...result, artifact: run.name})))
}

export function resultsForArtifact<T extends {artifact: string}>(results: readonly T[], artifactName: string | null): T[] {
  return artifactName ? results.filter((result) => result.artifact === artifactName) : []
}
