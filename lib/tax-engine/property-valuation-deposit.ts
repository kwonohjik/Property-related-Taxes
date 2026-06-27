/**
 * 예금·저금·적금 §63④ 평가 헬퍼 — 순수 함수
 *
 * 법령: 상속세및증여세법 §63 ④
 *   평가액 = ㉠ 예입원금 + ㉡ 미수이자 − ㉢ 원천징수세액
 *
 * 설계 원칙:
 *   - DB 직접 호출 없음 (순수 함수)
 *   - 엔진은 날짜 연산 미수행 — 클라이언트가 injectSavingsAccrualIfAuto로 pre-inject 후 전달
 *   - 정수 연산: safeMulDivRound(round-half-up) for ㉡, Math.floor for ㉢ (원 미만 절사)
 */

import { differenceInDays, parseISO } from "date-fns";
import { safeMulDivRound } from "./tax-utils";
import type { EstateItem } from "./types/inheritance-gift.types";

/**
 * ㉠+㉡-㉢ 예금·저금·적금 §63④ 법정평가 산식.
 *
 * 경과일수: differenceInDays(valuationDate, startDate) — date-fns 초일불산입.
 * ㉡ 미수이자: safeMulDivRound(principal × annualRate%, elapsedDays, 100 × 365) — round-half-up.
 * ㉢-1 이자소득세: Math.floor(㉡ × withholdingRate% / 100) — 소득세법 §129①1라.
 * ㉢-2 지방소득세: Math.floor(㉢-1 / 10) — 지방세법 §103의13①.
 * ㉢ 합계: ㉢-1 + ㉢-2 (includeLocalTax=false이면 ㉢-2=0).
 */
export function computeSavingsAccrual(p: {
  principal: number;
  annualRate: number;        // % 단위 (5 = 5%)
  startDate: Date;
  valuationDate: Date;
  withholdingRate: number;   // % 단위 (14 = 14%)
  includeLocalTax: boolean;
}): {
  elapsedDays: number;
  accruedInterest: number;
  incomeWithholding: number;
  localIncomeTax: number;
  withholdingTax: number;
  valuatedAmount: number;
} {
  // 초일불산입 (date-fns differenceInDays: end - start)
  const elapsedDays = Math.max(0, differenceInDays(p.valuationDate, p.startDate));

  // ㉡ = principal × rate% × days / (100 × 365) — round-half-up (국고금관리법 §47 원 단위)
  const accruedInterest = safeMulDivRound(
    p.principal * p.annualRate,
    elapsedDays,
    100 * 365,
  );

  // ㉢-1 = floor(㉡ × 원천징수율% / 100) — 소득세법 §129①1라
  const incomeWithholding = Math.floor((accruedInterest * p.withholdingRate) / 100);

  // ㉢-2 = floor(㉢-1 / 10) — 지방세법 §103의13①
  const localIncomeTax = p.includeLocalTax ? Math.floor(incomeWithholding / 10) : 0;

  const withholdingTax = incomeWithholding + localIncomeTax;
  const valuatedAmount = p.principal + accruedInterest - withholdingTax;

  return { elapsedDays, accruedInterest, incomeWithholding, localIncomeTax, withholdingTax, valuatedAmount };
}

/**
 * auto 모드 EstateItem에 미수이자·원천징수세액을 주입하여 새 객체를 반환하는 클라이언트 헬퍼.
 *
 * - savingsValuationMode !== "auto" 또는 필수 입력 누락 시 원본 그대로 반환 (side-effect 없음).
 * - 반환 객체는 엔진(evaluateFinancial)에 전달하여 "deposit_statutory" 평가에 사용.
 * - 엔진은 날짜를 받지 않으므로 반드시 이 함수를 API Orchestrator 또는 클라이언트 변환 레이어에서 호출.
 */
export function injectSavingsAccrualIfAuto(item: EstateItem, valuationDate: Date): EstateItem {
  const mode = item.savingsValuationMode ?? "balance";
  if (mode !== "auto" || item.savingsPrincipal == null || !item.savingsStartDate) {
    return item;
  }

  const accrual = computeSavingsAccrual({
    principal: item.savingsPrincipal,
    annualRate: item.savingsAnnualRate ?? 0,
    startDate: parseISO(item.savingsStartDate),
    valuationDate,
    withholdingRate: item.savingsWithholdingRate ?? 14,
    includeLocalTax: item.savingsIncludeLocalTax ?? true,
  });

  return {
    ...item,
    savingsAccruedInterest: accrual.accruedInterest,
    savingsWithholdingTax: accrual.withholdingTax,
  };
}
