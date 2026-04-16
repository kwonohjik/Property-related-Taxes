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
} from "./types/inheritance-gift.types";

// ExemptionCheckedItem은 types/inheritance-gift.types.ts에 정의됨
// 하위 호환을 위해 re-export
export type { ExemptionCheckedItem };


/** 비과세 평가 상세 결과 (항목별) */
export interface ExemptionItemResult {
  ruleId: string;
  ruleName: string;
  claimedAmount: number;
  /** 실제 인정된 비과세 금액 */
  exemptAmount: number;
  /** 한도 초과로 일반 과세되는 금액 */
  taxableOverflow: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

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
  };

  const warnings: string[] = [];
  let exemptAmount = 0;
  let taxableOverflow = 0;
  const breakdown: CalculationStep[] = [];

  // === 문화재: 지정 취소 시 과세 ===
  if (rule.id === "inh_cultural_property") {
    if (item.culturalDesignationRevoked) {
      warnings.push(`문화재 지정 취소 — 상속세 추징 대상 (${EXEMPTION.INH_NONTAXABLE} 1호 단서)`);
      exemptAmount = 0;
      taxableOverflow = item.claimedAmount;
      breakdown.push({
        label: "문화재 지정 취소 — 비과세 불인정",
        amount: 0,
        lawRef: EXEMPTION.INH_NONTAXABLE,
      });
    } else {
      exemptAmount = item.claimedAmount;
      breakdown.push({
        label: "국가·시도 지정 문화재 비과세",
        amount: exemptAmount,
        lawRef: EXEMPTION.INH_NONTAXABLE,
      });
    }
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 금양임야: 600평(1,983㎡) 초과분 과세 ===
  if (rule.id === "inh_forest_burial") {
    const limitM2 = rule.limitAreaM2 ?? 1983;
    const claimedM2 = item.areaM2 ?? 0;
    if (claimedM2 > limitM2) {
      const exemptRatio = limitM2 / claimedM2;
      exemptAmount = Math.floor(item.claimedAmount * exemptRatio);
      taxableOverflow = item.claimedAmount - exemptAmount;
      warnings.push(`금양임야 면적 ${claimedM2}㎡ 중 ${limitM2}㎡(600평)만 비과세, 초과분 ${taxableOverflow.toLocaleString()}원 과세`);
    } else {
      exemptAmount = item.claimedAmount;
    }
    breakdown.push({ label: `금양임야 비과세 (${Math.min(claimedM2, limitM2)}㎡)`, amount: exemptAmount, lawRef: EXEMPTION.INH_NONTAXABLE });
    if (taxableOverflow > 0) breakdown.push({ label: "초과 면적 과세", amount: taxableOverflow });
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 묘토: 1,200평(3,966㎡) 초과분 과세 ===
  if (rule.id === "inh_grave_land") {
    const limitM2 = rule.limitAreaM2 ?? 3966;
    const claimedM2 = item.areaM2 ?? 0;
    if (claimedM2 > limitM2) {
      const exemptRatio = limitM2 / claimedM2;
      exemptAmount = Math.floor(item.claimedAmount * exemptRatio);
      taxableOverflow = item.claimedAmount - exemptAmount;
      warnings.push(`묘토 면적 ${claimedM2}㎡ 중 ${limitM2}㎡(1,200평)만 비과세`);
    } else {
      exemptAmount = item.claimedAmount;
    }
    breakdown.push({ label: `묘토 비과세 (${Math.min(claimedM2, limitM2)}㎡)`, amount: exemptAmount, lawRef: EXEMPTION.INH_NONTAXABLE });
    return { ...base, exemptAmount, taxableOverflow, breakdown, warnings };
  }

  // === 공익법인: 동족주식 초과분 과세 (§16 ②) ===
  if (rule.id === "inh_public_interest") {
    if (item.relatedStockExceeded && item.excessStockAmount != null && item.excessStockAmount > 0) {
      // 초과분은 과세, 한도 내 금액만 비과세
      taxableOverflow = item.excessStockAmount;
      exemptAmount = Math.max(0, item.claimedAmount - taxableOverflow);
      breakdown.push({ label: "공익법인 출연재산 비과세 (5% 한도 내)", amount: exemptAmount, lawRef: EXEMPTION.PUBLIC_INTEREST });
      breakdown.push({
        label: `동족주식 5% 초과분 — 상속세 과세 (${EXEMPTION.INH_RELATED_STOCK})`,
        amount: taxableOverflow,
        lawRef: EXEMPTION.PUBLIC_INTEREST,
        note: `초과분 ${taxableOverflow.toLocaleString()}원은 상속재산 합산 과세`,
      });
      warnings.push(`공익법인 동족주식 5% 초과 보유 — 초과분 ${taxableOverflow.toLocaleString()}원 상속세 과세 (${EXEMPTION.INH_RELATED_STOCK})`);
    } else if (item.relatedStockExceeded) {
      // 초과 여부는 알지만 금액 미입력 시 경고만
      warnings.push(`공익법인 동족주식 5% 초과 보유 확인됨 — 초과분 금액 입력 필요 (${EXEMPTION.INH_RELATED_STOCK})`);
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
      label: `장애인 신탁 한도 (5억 - 기사용 ${priorUsed.toLocaleString()}원 = 잔여 ${remaining.toLocaleString()}원)`,
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

  const totalExemptAmount = itemResults.reduce((s, r) => s + r.exemptAmount, 0);

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
  if (input.culturalProperty && input.culturalProperty > 0) {
    items.push({ ruleId: "inh_cultural_property", claimedAmount: input.culturalProperty });
  }
  if (input.publicInterestContribution && input.publicInterestContribution > 0) {
    items.push({ ruleId: "inh_public_interest", claimedAmount: input.publicInterestContribution });
  }

  return items;
}
