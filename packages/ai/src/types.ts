import type { z } from "zod";

export interface AiProviderStatus {
  provider: string;
  available: boolean;
  baseUrl: string;
  model: string;
  modelInstalled: boolean;
  error: string | null;
}

export interface StructuredGenerationRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
}

export interface AiProvider {
  status(): Promise<AiProviderStatus>;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}
