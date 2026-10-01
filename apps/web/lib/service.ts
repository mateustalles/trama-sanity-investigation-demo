import type {AsyncTramaService, TramaService} from "@trama/application";

/** Operational mutations belong to the private product, not this demo. */
export function getTramaService(): TramaService {
  throw new Error("Operational product services are unavailable in this read-only demo.");
}
export async function getRequestTramaService(): Promise<TramaService | AsyncTramaService> {
  throw new Error("Operational product services are unavailable in this read-only demo.");
}
