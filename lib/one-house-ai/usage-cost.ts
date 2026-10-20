/**
 * AI 호출 1회 비용 추정 — 응답 `usage`(토큰 수) × 모델 정가.
 *
 * 정가 기준 추정이다(청구서가 아니다). 단가표에 없는 모델(서버 측 대체 모델로 응답한 경우 등)은 금액을 내지 않는다.
 * 캐시 쓰기는 1시간 TTL 단가(기본 입력의 2배)다 — 추출·의견 모두 `ttl: "1h"`로만 캐시한다(`extract.ts`·`opinion/opinion.ts`).
 */
import type { ExtractionRun } from "./extract";

type Usage = ExtractionRun["usage"];

/** 100만 토큰당 달러 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
};

export function estimateUsageCostUsd(model: string, usage: Usage): number | null {
  const p = PRICE_PER_MTOK[model];
  if (!p) return null;
  const sum =
    usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite;
  return sum / 1_000_000;
}
