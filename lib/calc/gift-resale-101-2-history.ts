/**
 * §101② 증여 후 우회양도 판정 — 양도세 이력 후보 선별 (P4)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §7 P4 · §8 Q-6·Q-8′
 *
 * 1호 «수증자 양도소득세 결정세액»·2호 «증여자 직접양도 결정세액» 칸을 저장된 양도세 이력으로 채운다.
 * 계산·네트워크를 하지 않는다 — 저장된 값을 읽어 후보를 가르기만 한다.
 *
 * ## 후보 조건 (Q-8′)
 * 양도세 이력(`taxType === "transfer"`) 중 `resultData`가 `{ mode: "single", result }` 이고
 * `result.determinedTax`가 **0 이상 정수**인 것만. 결정세액은 가산세(`penaltyTax`)를 뺀 값이다.
 *
 * | resultData 형태 | 후보 | reason |
 * |---|---|---|
 * | `mode: "single"` + 정수 `determinedTax` ≥ 0 | O | — |
 * | `mode: "single"` + 결정세액 누락·음수·소수 | X | `no_determined_tax` |
 * | `mode: "bundled"` (일괄양도) | X | `bundled` |
 * | `mode: "mixed-use"` (겸용주택) | X | `mixed_use` |
 * | `mode` 없음 + `AggregateTransferResult`(다건) | X | `multi` |
 * | 그 밖(알 수 없는 형태) | X | `no_determined_tax` |
 * | 양도세가 아닌 세목 | X | `not_transfer` |
 *
 * 형태 판별은 `lib/calc/cross-104-5-adapter.ts` 머리 주석의 resultData 3종과 같은 신호를 쓴다.
 */
import type { CalculationRecord } from "@/lib/storage/types";

export type GiftResaleExtractFailReason =
  | "not_transfer"
  | "bundled"
  | "mixed_use"
  | "multi"
  | "no_determined_tax";

export type GiftResaleExtract =
  | { ok: true; determinedTax: number }
  | { ok: false; reason: GiftResaleExtractFailReason };

export interface GiftResaleCandidate {
  record: CalculationRecord;
  /** 가산세를 뺀 결정세액(원) — 0 이상 정수 */
  determinedTax: number;
}

/** 다건 화면이 `mode` 없이 직접 저장하는 `AggregateTransferResult`의 신호 필드(cross-104-5-adapter와 같다) */
function isAggregateShape(v: Record<string, unknown>): boolean {
  return "groupTaxes" in v && "calculatedTaxByGroups" in v;
}

export function extractGiftResaleDeterminedTax(record: CalculationRecord): GiftResaleExtract {
  if (record.taxType !== "transfer") return { ok: false, reason: "not_transfer" };

  const data = record.resultData;
  if (data === null || typeof data !== "object") return { ok: false, reason: "no_determined_tax" };

  if (data.mode === "bundled") return { ok: false, reason: "bundled" };
  if (data.mode === "mixed-use") return { ok: false, reason: "mixed_use" };
  if (data.mode === undefined && isAggregateShape(data)) return { ok: false, reason: "multi" };
  if (data.mode !== "single") return { ok: false, reason: "no_determined_tax" };

  const result = data.result;
  if (result === null || typeof result !== "object") return { ok: false, reason: "no_determined_tax" };
  const tax = (result as Record<string, unknown>).determinedTax;
  if (typeof tax !== "number" || !Number.isInteger(tax) || tax < 0) {
    return { ok: false, reason: "no_determined_tax" };
  }
  return { ok: true, determinedTax: tax };
}

/** 후보만 — 최신순(`createdAt` 내림차순). 같은 시각이면 입력 순서를 유지한다(안정 정렬) */
export function buildGiftResaleCandidates(records: CalculationRecord[]): GiftResaleCandidate[] {
  const out: GiftResaleCandidate[] = [];
  for (const record of records) {
    const ex = extractGiftResaleDeterminedTax(record);
    if (ex.ok) out.push({ record, determinedTax: ex.determinedTax });
  }
  return out.sort((a, b) => (a.record.createdAt < b.record.createdAt ? 1 : a.record.createdAt > b.record.createdAt ? -1 : 0));
}
