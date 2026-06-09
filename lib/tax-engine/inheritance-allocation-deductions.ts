/**
 * 상속인별 배부 — 자산-수준 분배·차감 안분 헬퍼 (800줄 정책 분리, 2026-06-09)
 *
 * inheritance-allocation.ts에서 추출. 순수 함수 모음:
 *  - resolveAllocationsByHeir: 협의분할 입력/법정상속분 fallback 집계
 *  - scaleMapToTotal: 목표 총액으로 비율 환산(잔액 흡수)
 *  - computeExemptByHeir: ㉠ 비과세/과세가액 불산입 2맵 분리 안분
 *  - computeDebtByHeirWithFuneralCap: ㉡ 채무/공과금/장례비 3맵 분리 안분(장례비 §14 한도)
 *
 * Pure Engine.
 */

import {
  distributeByLegalShares,
  type LegalShareResult,
} from "./inheritance-legal-share";
import {
  findExemptionRuleById,
  getExemptionTreatment,
} from "./exemption-rules";
import type {
  HeirAllocation,
  DebtItem,
  ExemptionCheckedItem,
} from "./types/inheritance-gift.types";

/**
 * heir별 금액 집계 — `heirAllocations` 입력 자산은 그 합, **미입력(undefined/빈배열) 자산은
 * 법정상속분(`legalShares`)으로 자동 배분**. (계획 §2, 디자인 §2-3)
 * @param amountOf 미입력 자산의 배분 기준 금액(평가액·채무액)
 */
export function resolveAllocationsByHeir<
  T extends { heirAllocations?: HeirAllocation[] },
>(
  items: T[],
  amountOf: (item: T) => number,
  legalShares: LegalShareResult,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const item of items) {
    if (item.heirAllocations && item.heirAllocations.length > 0) {
      // 협의분할 입력 — 그대로 합산 (합계검증은 validate에서)
      for (const alloc of item.heirAllocations) {
        sums.set(alloc.heirId, (sums.get(alloc.heirId) ?? 0) + alloc.amount);
      }
    } else {
      // 미입력 — 법정상속분 자동 배분
      const dist = distributeByLegalShares(amountOf(item), legalShares);
      for (const [heirId, amt] of dist) {
        sums.set(heirId, (sums.get(heirId) ?? 0) + amt);
      }
    }
  }
  return sums;
}

/**
 * Map<heirId, raw>을 목표 총액(target)으로 비율 환산 — 마지막 항목 잔액 흡수(Σ==target 보장).
 * `scaleAllocations`(inheritance-collateral-debt.ts)의 Map 버전. raw 합 0이면 빈 Map.
 */
export function scaleMapToTotal(
  raw: Map<string, number>,
  target: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const entries = [...raw.entries()].filter(([, v]) => v !== 0);
  if (entries.length === 0 || target <= 0) return out;
  const denom = entries.reduce((s, [, v]) => s + v, 0);
  if (denom <= 0) return out;
  let running = 0;
  entries.forEach(([heirId, v], i) => {
    const isLast = i === entries.length - 1;
    const amt = isLast ? target - running : Math.floor((target * v) / denom);
    running += amt;
    out.set(heirId, amt);
  });
  return out;
}

/**
 * 비과세·과세가액 불산입 재산의 상속인별 차감액(exemptByHeir) 계산 (작업4, anchor A1 확정).
 *
 * 2단계 안분 — 분배 단위(claimedAmount) ≠ 차감 단위(인정 exemptAmount):
 *   1. claimedAmount 비율로 raw 분배(협의분할 입력) 또는 법정상속분(미입력)
 *   2. scaleMapToTotal(raw, 인정 exemptAmount)로 인정액 안분(잔액 흡수, Σ==인정액)
 * 한도초과(금양임야·족보 등)에서 claimedAmount ≠ exemptAmount이므로 단순 합산 불가.
 */
export function computeExemptByHeir(
  exemptionItems: ExemptionCheckedItem[],
  recognizedByRuleId: Map<string, number>,
  legalShares: LegalShareResult,
): { nonTaxableByHeir: Map<string, number>; notIncludedByHeir: Map<string, number> } {
  // ㉠ 분리 — 비과세(§11·§12)와 과세가액 불산입(§16·§17) 각각 안분.
  //   ExemptionCheckedItem에는 treatment 없음(ruleId만) → 룰 정의에서 단일 헬퍼로 판정.
  const nonTaxableByHeir = new Map<string, number>();
  const notIncludedByHeir = new Map<string, number>();
  for (const ex of exemptionItems) {
    const recognized = recognizedByRuleId.get(ex.ruleId) ?? 0;
    if (recognized <= 0) continue; // 인정액 0(사회통념 미입력 등) → 차감 없음
    // 1단계: claimedAmount 분배 비율 raw
    const raw =
      ex.heirAllocations && ex.heirAllocations.length > 0
        ? new Map(ex.heirAllocations.map((a) => [a.heirId, a.amount]))
        : distributeByLegalShares(ex.claimedAmount, legalShares);
    // 2단계: 인정액으로 환산(잔액 흡수)
    const scaled = scaleMapToTotal(raw, recognized);
    // 3단계: treatment 판정 — 단일 헬퍼 재사용 (rule.taxTreatment ?? "non_taxable")
    const rule = findExemptionRuleById(ex.ruleId);
    const target =
      rule && getExemptionTreatment(rule) === "not_included"
        ? notIncludedByHeir
        : nonTaxableByHeir;
    for (const [heirId, v] of scaled) {
      target.set(heirId, (target.get(heirId) ?? 0) + v);
    }
  }
  return { nonTaxableByHeir, notIncludedByHeir };
}

/**
 * T7 (R3): 장례비 §14 한도(식대 1천만·봉안 5백만) 적용 후 채무 인별 배부.
 * funeral을 식대/봉안 category별로 raw 분배 → capped 총액으로 비율 환산(잔액 흡수).
 * 비-funeral 채무는 그대로. Σ debtByHeir == deductedBeforeAggregation(엔진 STEP3 capped)와 정합.
 */
export function computeDebtByHeirWithFuneralCap(
  debtItems: DebtItem[],
  legalShares: LegalShareResult,
): {
  debtPrincipalByHeir: Map<string, number>; // ㉡ 채무 §14①3호 (financial+personal)
  publicChargeByHeir: Map<string, number>; // ㉡ 공과금 §14①1호 (tax)
  funeralByHeir: Map<string, number>; // ㉡ 장례비 §14①2호 (funeral, capped)
} {
  const mealItems = debtItems.filter((d) => d.category === "funeral" && !d.isBongan);
  const bonganItems = debtItems.filter((d) => d.category === "funeral" && d.isBongan);
  // ㉡ 분리 — 채무(financial+personal)와 공과금(tax) 별도 안분.
  const principalItems = debtItems.filter(
    (d) => d.category === "financial" || d.category === "personal",
  );
  const taxItems = debtItems.filter((d) => d.category === "tax");

  const rawMeal = mealItems.reduce((s, d) => s + d.amount, 0);
  const rawBongan = bonganItems.reduce((s, d) => s + d.amount, 0);
  const cappedMeal = Math.min(rawMeal, 10_000_000);
  const cappedBongan = Math.min(rawBongan, 5_000_000);

  const debtPrincipalByHeir = resolveAllocationsByHeir(principalItems, (it) => it.amount, legalShares);
  const publicChargeByHeir = resolveAllocationsByHeir(taxItems, (it) => it.amount, legalShares);
  const mealRawByHeir = resolveAllocationsByHeir(mealItems, (it) => it.amount, legalShares);
  const bonganRawByHeir = resolveAllocationsByHeir(bonganItems, (it) => it.amount, legalShares);

  // 한도 미초과면 capped==raw → scaleMapToTotal이 동일값 반환(잔차 0).
  const mealByHeir = scaleMapToTotal(mealRawByHeir, cappedMeal);
  const bonganByHeir = scaleMapToTotal(bonganRawByHeir, cappedBongan);

  const funeralByHeir = new Map<string, number>(mealByHeir);
  for (const [heirId, amt] of bonganByHeir)
    funeralByHeir.set(heirId, (funeralByHeir.get(heirId) ?? 0) + amt);

  return { debtPrincipalByHeir, publicChargeByHeir, funeralByHeir };
}
