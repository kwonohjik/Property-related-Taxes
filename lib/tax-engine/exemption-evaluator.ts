/**
 * 비과세 항목 평가기 (상증법 §11·§12·§46·§46의2)
 *
 * 체크리스트 항목 → 차감액 계산
 * 한도 초과분은 일반 과세분으로 분리
 */

import { EXEMPTION, GIFT } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import {
  DISABLED_TRUST_LIMIT,
  findExemptionRuleById,
  type ExemptionRule,
} from "./exemption-rules";
import type {
  CalculationStep,
  ExemptionInput,
  ExemptionResult,
  ExemptionCheckedItem,
  ExemptionItemResult,
} from "./types/inheritance-gift.types";

// ExemptionCheckedItem·ExemptionItemResult는 types/inheritance-exemption.types.ts에 정의됨
// (D-8 순환 의존 회피: evaluator→types 단방향). 하위 호환 위해 re-export.
export type { ExemptionCheckedItem, ExemptionItemResult };

// ============================================================
// 항목별 비과세 계산
// ============================================================

function evaluateSingleExemption(
  item: ExemptionCheckedItem,
  rule: ExemptionRule,
): ExemptionItemResult {
  const base: Omit<ExemptionItemResult, "exemptAmount" | "taxableOverflow" | "breakdown" | "warnings"> = {
    ruleId: rule.id,
    ruleName: rule.name,
    claimedAmount: item.claimedAmount,
    // 과세상 취급 echo — §16·§17 과세가액 불산입 vs §12·§46 비과세 (결과 화면 그룹 구분, 작업1)
    treatment: rule.taxTreatment ?? "non_taxable",
  };

  const warnings: string[] = [];
  let exemptAmount = 0;
  let taxableOverflow = 0;
  const breakdown: CalculationStep[] = [];

  // === 금양임야: 9,900㎡ 초과분 면적 안분 과세 (상증령 §8③1호) ===
  if (rule.id === "inh_forest_burial") {
    const limitM2 = rule.limitAreaM2 ?? EXEMPTION.GRAVE_FOREST_LIMIT_M2;
    const claimedM2 = item.claimedAreaM2 ?? item.areaM2 ?? 0;
    if (claimedM2 > limitM2) {
      const exemptRatio = limitM2 / claimedM2;
      exemptAmount = Math.floor(item.claimedAmount * exemptRatio);
      taxableOverflow = item.claimedAmount - exemptAmount;
      warnings.push(`금양임야 면적 ${claimedM2}㎡ 중 ${limitM2}㎡(9,900㎡ 한도)만 비과세, 초과분 ${taxableOverflow.toLocaleString()} 과세 (상증령 §8③1호)`);
    } else {
      exemptAmount = item.claimedAmount;
    }
    breakdown.push({ label: `금양임야 비과세 (${Math.min(claimedM2, limitM2)}㎡)`, amount: exemptAmount, lawRef: EXEMPTION.GRAVE_FOREST_AREA });
    if (taxableOverflow > 0) breakdown.push({ label: "금양임야 초과 면적 과세", amount: taxableOverflow });
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 묘토: 1,980㎡ 초과분 면적 안분 과세 (상증령 §8③2호) ===
  if (rule.id === "inh_grave_land") {
    const limitM2 = rule.limitAreaM2 ?? EXEMPTION.GRAVE_LAND_LIMIT_M2;
    const claimedM2 = item.claimedAreaM2 ?? item.areaM2 ?? 0;
    if (claimedM2 > limitM2) {
      const exemptRatio = limitM2 / claimedM2;
      exemptAmount = Math.floor(item.claimedAmount * exemptRatio);
      taxableOverflow = item.claimedAmount - exemptAmount;
      warnings.push(`묘토 면적 ${claimedM2}㎡ 중 ${limitM2}㎡(1,980㎡ 한도)만 비과세, 초과분 ${taxableOverflow.toLocaleString()} 과세 (상증령 §8③2호)`);
    } else {
      exemptAmount = item.claimedAmount;
    }
    breakdown.push({ label: `묘토 비과세 (${Math.min(claimedM2, limitM2)}㎡)`, amount: exemptAmount, lawRef: EXEMPTION.GRAVE_LAND_AREA });
    if (taxableOverflow > 0) breakdown.push({ label: "묘토 초과 면적 과세", amount: taxableOverflow });
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 족보·제구: 1천만원 한도 (상증령 §8③3호) — social_norm 일반 분기보다 앞 (R1-3 fallthrough 방지) ===
  if (rule.id === "inh_ritual_items") {
    const limit = rule.limitAmount ?? EXEMPTION.RITUAL_AMOUNT_LIMIT;
    exemptAmount = Math.min(item.claimedAmount, limit);
    taxableOverflow = item.claimedAmount - exemptAmount;
    breakdown.push({ label: `족보·제구 비과세 (1천만원 한도)`, amount: exemptAmount, lawRef: EXEMPTION.GRAVE_RITUAL });
    if (taxableOverflow > 0) {
      breakdown.push({ label: "족보·제구 1천만원 초과 과세", amount: taxableOverflow });
      warnings.push(`족보·제구 1천만원 한도 초과분 ${taxableOverflow.toLocaleString()} 과세 (상증령 §8③3호 단서)`);
    }
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 공익법인: 동족주식 초과분 과세 (§16 ②) ===
  if (rule.id === "inh_public_interest") {
    if (item.relatedStockExceeded && item.excessStockAmount != null && item.excessStockAmount > 0) {
      // 초과분은 과세, 한도 내 금액만 비과세
      taxableOverflow = item.excessStockAmount;
      exemptAmount = Math.max(0, item.claimedAmount - taxableOverflow);
      breakdown.push({ label: "공익법인 출연재산 비과세 (한도 이내)", amount: exemptAmount, lawRef: EXEMPTION.PUBLIC_INTEREST });
      breakdown.push({
        // §16②2호 본칙 10% (가목 20%·나목/다목 5% 예외). 임계는 사용자 직접 입력값 기준.
        label: `동족주식 한도 초과분 — 상속세 과세 (${EXEMPTION.INH_RELATED_STOCK})`,
        amount: taxableOverflow,
        lawRef: EXEMPTION.PUBLIC_INTEREST,
        note: `초과분 ${taxableOverflow.toLocaleString()}원은 상속재산 합산 과세`,
      });
      warnings.push(`공익법인 동족주식 한도 초과 보유 — 초과분 ${taxableOverflow.toLocaleString()} 상속세 과세 (${EXEMPTION.INH_RELATED_STOCK})`);
    } else if (item.relatedStockExceeded) {
      // 초과 여부는 알지만 금액 미입력 시 경고만
      warnings.push(`공익법인 동족주식 한도 초과 보유 확인됨 — 초과분 금액 입력 필요 (${EXEMPTION.INH_RELATED_STOCK})`);
      exemptAmount = item.claimedAmount;
      breakdown.push({ label: "공익법인 출연재산 비과세 (초과분 금액 미입력)", amount: exemptAmount, lawRef: EXEMPTION.PUBLIC_INTEREST });
    } else {
      exemptAmount = item.claimedAmount;
      breakdown.push({ label: "공익법인 출연재산 비과세", amount: exemptAmount, lawRef: EXEMPTION.PUBLIC_INTEREST });
    }
    warnings.push(`사후관리: 출연 후 3년 내 공익 목적 외 사용 시 추징 (${EXEMPTION.PUBLIC_FOLLOWUP})`);
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 장애인 신탁: 5억 한도 (10년 합산) ===
  if (rule.id === "gift_disabled_trust") {
    const priorUsed = item.priorDisabledTrustUsed ?? 0;
    const remaining = Math.max(0, DISABLED_TRUST_LIMIT - priorUsed);
    exemptAmount = Math.min(item.claimedAmount, remaining);
    taxableOverflow = item.claimedAmount - exemptAmount;

    breakdown.push({
      label: `장애인 신탁 한도 (5억 - 기사용 ${priorUsed.toLocaleString()} = 잔여 ${remaining.toLocaleString()}`,
      amount: exemptAmount,
      lawRef: EXEMPTION.PUBLIC_INTEREST,
    });
    if (taxableOverflow > 0) {
      breakdown.push({ label: "5억 초과 — 일반 증여세 과세", amount: taxableOverflow });
      warnings.push(`장애인 신탁 한도(5억) 초과 ${taxableOverflow.toLocaleString()}원은 일반 증여세 과세`);
    }
    warnings.push(`신탁 해지 시 잔존 원금 즉시 증여세 과세 (${EXEMPTION.DISABLED_TRUST_REVOKE})`);
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 혼수품, 생활비, 축의금 등 (사회통념) — 금액 전액 인정 + 경고 ===
  if (rule.limitType === "social_norm" || rule.limitType === "unlimited") {
    exemptAmount = item.claimedAmount;
    breakdown.push({
      label: `${rule.name} 비과세`,
      amount: exemptAmount,
      lawRef: rule.lawRef,
    });
    if (rule.riskNote) warnings.push(rule.riskNote);
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 기본: 전액 비과세 ===
  exemptAmount = item.claimedAmount;
  breakdown.push({ label: `${rule.name} 비과세`, amount: exemptAmount, lawRef: rule.lawRef });
  return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
}

// ============================================================
// 혼인공제 평생 1회 검증 (§53의2)
// ============================================================

/**
 * 혼인공제 평생 1회 사용 여부 검증 (§53의2)
 * 이미 사용했으면 TaxCalculationError를 던지지 않고 경고로만 처리
 */
export function validateMarriageExemptionOnce(
  items: ExemptionCheckedItem[],
): string[] {
  const warnings: string[] = [];
  const marriageItem = items.find((i) => i.ruleId === "gift_marriage_birth");
  if (marriageItem?.marriageExemptionAlreadyUsed) {
    warnings.push(
      `혼인 증여재산공제(${GIFT.MARRIAGE_DEDUCTION})는 평생 1회만 적용 가능합니다. 기사용 내역 확인이 필요합니다.`,
    );
  }
  return warnings;
}

// ============================================================
// 금양임야+묘토 합산 2억원 한도 (상증령 §8③ 단서)
// ============================================================

/**
 * 금양임야(inh_forest_burial)+묘토(inh_grave_land) 비과세액 합산이 2억원 초과 시
 * 비율 안분으로 2억원까지만 인정. floor 잔액은 묘토에 흡수(합계 정확히 2억).
 * itemResults를 in-place 수정 (exemptAmount·taxableOverflow·warnings).
 */
function applyGraveGroupCap(itemResults: ExemptionItemResult[]): void {
  const forestIdx = itemResults.findIndex((r) => r.ruleId === "inh_forest_burial");
  const graveIdx = itemResults.findIndex((r) => r.ruleId === "inh_grave_land");
  if (forestIdx === -1 && graveIdx === -1) return;

  const forestExempt = forestIdx >= 0 ? itemResults[forestIdx].exemptAmount : 0;
  const graveExempt = graveIdx >= 0 ? itemResults[graveIdx].exemptAmount : 0;
  const groupSum = forestExempt + graveExempt;
  const LIMIT = EXEMPTION.GRAVE_GROUP_AMOUNT_LIMIT;
  if (groupSum <= LIMIT) return;

  // 비율 안분 (정수 floor) — 잔액은 묘토 흡수 (합계 정확히 2억)
  const cappedForest = forestIdx >= 0 ? Math.floor((LIMIT * forestExempt) / groupSum) : 0;
  const cappedGrave = LIMIT - cappedForest;

  if (forestIdx >= 0) {
    const prev = itemResults[forestIdx].exemptAmount;
    itemResults[forestIdx].taxableOverflow += prev - cappedForest;
    itemResults[forestIdx].exemptAmount = cappedForest;
    itemResults[forestIdx].warnings.push(
      `금양임야·묘토 합산 2억원 한도 초과 — 금양임야 비과세 ${cappedForest.toLocaleString()}원으로 조정 (상증령 §8③ 단서)`,
    );
  }
  if (graveIdx >= 0) {
    const prev = itemResults[graveIdx].exemptAmount;
    itemResults[graveIdx].taxableOverflow += prev - cappedGrave;
    itemResults[graveIdx].exemptAmount = cappedGrave;
    itemResults[graveIdx].warnings.push(
      `금양임야·묘토 합산 2억원 한도 초과 — 묘토 비과세 ${cappedGrave.toLocaleString()}원으로 조정 (상증령 §8③ 단서)`,
    );
  }
}

// ============================================================
// 통합 비과세 평가
// ============================================================

/**
 * 체크리스트 기반 비과세 항목 일괄 계산
 *
 * @param checkedItems 사용자가 체크한 비과세 항목 목록
 * @param grossEstateValue 상속·증여 재산 총액 (비과세 한도 초과 방어용)
 */
export function evaluateExemptions(
  checkedItems: ExemptionCheckedItem[],
  grossEstateValue: number,
): ExemptionResult & { itemResults: ExemptionItemResult[] } {
  const itemResults: ExemptionItemResult[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set();

  for (const item of checkedItems) {
    const rule = findExemptionRuleById(item.ruleId);
    if (!rule) {
      throw new TaxCalculationError(
        TaxErrorCode.EXEMPTION_REQUIREMENT_FAILED,
        `비과세 룰 ID를 찾을 수 없습니다: ${item.ruleId}`,
      );
    }

    const result = evaluateSingleExemption(item, rule);
    itemResults.push(result);
    allWarnings.push(...result.warnings);
    allLaws.add(rule.lawRef);
  }

  // 혼인·출산공제(§53의2) 1회 검증은 gift-deductions.ts에서 처리
  // (§53의2는 비과세가 아닌 공제 항목 — GIFT_EXEMPTION_RULES에 없음)

  // 금양임야+묘토 합산 2억원 한도 (상증령 §8③ 단서) — cross-item 클램프
  applyGraveGroupCap(itemResults);

  const totalExemptAmount = itemResults.reduce((s, r) => s + r.exemptAmount, 0);

  // 결과 화면 그룹 구분용 분리 합계 (작업1). 클램프 전 인정액 기준 — 클램프는 비과세>과세가액 극단 케이스만.
  const nonTaxableTotal = itemResults
    .filter((r) => (r.treatment ?? "non_taxable") === "non_taxable")
    .reduce((s, r) => s + r.exemptAmount, 0);
  const notIncludedTotal = itemResults
    .filter((r) => r.treatment === "not_included")
    .reduce((s, r) => s + r.exemptAmount, 0);

  // 비과세 총액이 과세가액을 초과하지 않도록 방어
  const clampedExemptAmount = Math.min(totalExemptAmount, grossEstateValue);

  const breakdown: CalculationStep[] = [
    ...itemResults.flatMap((r) => r.breakdown),
    {
      label: "비과세 합계",
      amount: clampedExemptAmount,
      lawRef: EXEMPTION.INH_NONTAXABLE,
    },
  ];

  return {
    totalExemptAmount: clampedExemptAmount,
    nonTaxableTotal,
    notIncludedTotal,
    breakdown,
    appliedLaws: Array.from(allLaws),
    itemResults,
  };
}

// ============================================================
// 간편 변환: ExemptionInput → ExemptionCheckedItem[]
// ============================================================

/**
 * 상속세 API 입력의 ExemptionInput을 체크리스트 형태로 변환
 * (UI에서 직접 checkedItems를 구성하는 경우 이 함수 불필요)
 */
export function convertInheritanceExemptionInput(
  input: ExemptionInput,
): ExemptionCheckedItem[] {
  const items: ExemptionCheckedItem[] = [];

  if (input.donatedToState && input.donatedToState > 0) {
    items.push({ ruleId: "inh_state_bequest", claimedAmount: input.donatedToState });
  }
  if (input.ceremonialProperty && input.ceremonialProperty > 0) {
    items.push({ ruleId: "inh_ritual_items", claimedAmount: input.ceremonialProperty });
  }
  if (input.publicInterestContribution && input.publicInterestContribution > 0) {
    items.push({ ruleId: "inh_public_interest", claimedAmount: input.publicInterestContribution });
  }

  return items;
}
