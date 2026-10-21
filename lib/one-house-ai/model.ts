/**
 * 1세대1주택 AI — 모델·사용량·실패 타입(추출·의견·검증 공용). `extract.ts`가 같은 이름으로 다시 내보낸다(기존 import 경로 유지).
 */
export const ONE_HOUSE_EXTRACTION_MODEL = "claude-opus-5-5";

export type AiUsage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export class ExtractionFailedError extends Error {}
