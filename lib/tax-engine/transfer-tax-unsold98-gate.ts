/**
 * §98 시리즈 6조문 진입 방어 — `transfer-tax.ts` 800줄 정책 분리(NBL2611-C3 선행 분리, 동작 불변).
 */
import { stripAssetKindGatedReductions } from "./transfer-reductions/asset-kind-gate";
import { stripAcquisitionCauseGatedReductions } from "./transfer-reductions/unsold-98-acquisition-cause";
import { reductionAcquisitionCauseOf } from "./transfer-reductions/new-99-acquisition-cause";
import type { TransferTaxInput } from "./types/transfer.types";

/** §98 시리즈 6조문 진입 방어 — 자산 종류(US-44) → 취득 원인(US-07) 순으로 걷어 내고 고지를 모은다. */
export function stripUnsold98GatedReductions(input: TransferTaxInput): { reductions: TransferTaxInput["reductions"] | undefined; notices: string[] } {
  const byKind = stripAssetKindGatedReductions(input.propertyType, input.reductions);
  const byCause = stripAcquisitionCauseGatedReductions(
    byKind.reductions,
    reductionAcquisitionCauseOf(input),
    input.inheritedPresaleCompletedByHeir,
  );
  return { reductions: byCause.reductions, notices: [...byKind.notices, ...byCause.notices] };
}
