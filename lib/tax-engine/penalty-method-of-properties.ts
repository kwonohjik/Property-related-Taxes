/**
 * 집계 결과의 §114조의2 가산세를 **산정방식별**(환산취득가액 / 감정가액)로 가른다 — 결과 카드·상세명세서 라벨의 단일 소스 (PR-5b, Q-13).
 *
 * 종전 결과 카드는 가산세 행 라벨을 「환산취득가액」으로 고정했다 — 감정가액 건물 파트(비부담부증여 환산 경로 A3, 부담부증여 K-7)에서도 틀린 라벨이었다.
 * 방식은 건별 엔진이 가산세 step 에 싣는 `calculateBuildingPenalty` note(「… + 감정가액 적용」 / 「… + 환산취득가액 적용」)가 정본이다
 * (`transfer-tax-penalty-steps.ts`) — 여기서 새로 판정하지 않고 그 step 을 읽는다.
 */
import type { CalculationStep } from "./types/transfer.types";

export interface PenaltyMethodBucket {
  tax: number;
  /** 산정 기준액(= 가산세 ÷ 0.05) */
  basis: number;
}
export interface PenaltyMethodSums {
  estimated: PenaltyMethodBucket;
  appraisal: PenaltyMethodBucket;
}

export function penaltyMethodSums(
  properties: ReadonlyArray<{ penaltyTax?: number; penaltyBase?: number; steps?: CalculationStep[] }>,
): PenaltyMethodSums {
  const out: PenaltyMethodSums = { estimated: { tax: 0, basis: 0 }, appraisal: { tax: 0, basis: 0 } };
  for (const p of properties) {
    const tax = p.penaltyTax ?? 0;
    if (tax <= 0) continue;
    const step = p.steps?.find((s) => s.label.startsWith("환산가액적용가산세"));
    const bucket = step?.formula?.includes("감정가액 적용") ? out.appraisal : out.estimated;
    bucket.tax += tax;
    bucket.basis += p.penaltyBase ?? 0;
  }
  return out;
}
