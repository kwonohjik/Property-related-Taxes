/**
 * 상속세 비과세·과세가액 불산입 입력 검증 (inheritance-validate.ts에서 800줄 정책 분리, 2026-06-09).
 *  - validateExemptionAreaInput: 금양임야·묘토 면적 입력 (상증령 §8③)
 *  - validateExemptionItemAllocations: 협의분할 합계 (작업4)
 */

import type { ExemptionCheckedItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { findExemptionRuleById } from "@/lib/tax-engine/exemption-rules";

/**
 * 금양임야·묘토 비과세 면적 입력 검증 (상증령 §8③1·2호).
 * 면적 한도 항목 선택 시 면적(claimedAreaM2) 미입력 차단 — 자동 0 fallback 금지.
 * UI(ExemptionChecklist)가 면적 입력 위젯을 제공하므로 validate 차단과 정합 (CLAUDE.md ⑧).
 */
export function validateExemptionAreaInput(
  exemptions: ExemptionCheckedItem[] | undefined,
): string | null {
  for (const it of exemptions ?? []) {
    if (
      (it.ruleId === "inh_forest_burial" || it.ruleId === "inh_grave_land") &&
      (it.claimedAreaM2 == null || it.claimedAreaM2 <= 0)
    ) {
      const name = it.ruleId === "inh_forest_burial" ? "금양임야" : "묘토";
      return `${name} 비과세를 선택한 경우 면적(㎡)을 입력해야 합니다. (면적 한도 판정에 필요)`;
    }
  }
  return null;
}

/**
 * 갭5a — 공익법인 특수관계법인 주식 한도 자동계산 입력 검증 (§16②).
 * publicInterestType(유형 토글) 선택 시 발행총수·출연주식수·주당평가액 미입력 차단.
 * 부분 입력을 허용하면 전액 불산입으로 fallback되어 과소과세 → 차단(자동 fallback 금지, ⑧).
 * UI(RelatedStockLimitInput)가 토글 ON 시 입력 위젯을 제공하므로 validate 차단과 정합.
 */
export function validateRelatedStockInput(
  exemptions: ExemptionCheckedItem[] | undefined,
): string | null {
  for (const it of exemptions ?? []) {
    if (it.ruleId !== "inh_public_interest" || it.publicInterestType == null) continue;
    if ((it.relatedStockTotalShares ?? 0) <= 0)
      return "공익법인 특수관계법인 주식 한도(§16②)를 적용하려면 발행주식총수등을 입력해야 합니다.";
    if ((it.relatedStockDonatedShares ?? 0) <= 0)
      return "공익법인 특수관계법인 주식 한도(§16②)를 적용하려면 출연 주식수를 입력해야 합니다.";
    if ((it.relatedStockValuePerShare ?? 0) <= 0)
      return "공익법인 특수관계법인 주식 한도(§16②)를 적용하려면 1주당 평가액을 입력해야 합니다.";
  }
  return null;
}

/**
 * 비과세 협의분할 합계 검증 (작업4). 입력 시 Σamount === claimedAmount 강제 (미입력=통과).
 * validateEstateItemAllocations 패턴 복제. UI(HeirAllocationInput)가 분배 위젯 제공 → validate 정합 (⑧).
 */
export function validateExemptionItemAllocations(
  item: ExemptionCheckedItem,
): string | null {
  if (!item.heirAllocations || item.heirAllocations.length === 0) {
    return null; // 분배 미입력은 허용 (법정상속분 자동 안분)
  }
  const name = findExemptionRuleById(item.ruleId)?.name ?? "비과세 항목";
  const sum = item.heirAllocations.reduce((s, a) => s + a.amount, 0);
  if (sum !== item.claimedAmount) {
    return `"${name}" 협의분할 합계 ${sum.toLocaleString()}원 ≠ 청구액 ${item.claimedAmount.toLocaleString()}원`;
  }
  return null;
}

/**
 * 비과세·불산입 입력 전체 집계 검증 (면적 + 특수관계법인 주식 + 협의분할). 첫 오류 반환·없으면 null.
 * 메인 inheritance-validate.ts의 인라인 3블록을 단일 호출로 통합 (800줄 정책).
 */
export function validateAllExemptionInputs(
  exemptions: ExemptionCheckedItem[] | undefined,
): string | null {
  const areaErr = validateExemptionAreaInput(exemptions);
  if (areaErr) return areaErr;
  const stockErr = validateRelatedStockInput(exemptions);
  if (stockErr) return stockErr;
  for (const ex of exemptions ?? []) {
    const allocErr = validateExemptionItemAllocations(ex);
    if (allocErr) return allocErr;
  }
  return null;
}
