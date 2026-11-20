/**
 * 1세대1주택 AI — 모델·사용량·실패 타입(추출·의견·검증 공용). `extract.ts`가 같은 이름으로 다시 내보낸다(기존 import 경로 유지).
 */
export const ONE_HOUSE_EXTRACTION_MODEL = "claude-opus-5-5";

export type AiUsage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export class ExtractionFailedError extends Error {}

/**
 * 의견·원문 검증의 출력 한도 (2026-11 리뷰 I-29). Opus 5.5는 생각을 끌 수 없고 `max_tokens`는 생각 + 응답의 합산 상한이다(모델은 이 값을 보지 못한다).
 * 스트리밍 호출의 권장 기본값(약 64,000)으로 둔다 — 종전 16,000·8,000은 effort high의 생각에 잘리면 같은 상한으로 재시도만 부추겼다.
 */
export const AI_STREAMING_MAX_TOKENS = 64_000;

