/**
 * 담보채무 §14 자동 반영 — 파생 헬퍼 (순수 함수)
 *
 * 설계: docs/02-design/features/inheritance-collateral-debt-auto-deduction.design.md
 * 법령 (KoreanLaw MCP 검증 2026-05-26):
 *   - 상증법 §14①3호 — 거주자 상속 시 피상속인의 채무를 과세가액에서 공제
 *   - §66·시행령 §63 — 담보재산 평가(평가 상향)와 §14 공제는 별개 (물상보증은 §14 미공제)
 *   - §22·시행령 §19④ — §22 순금융재산 차감 금융채무는 §10①1호 금융회사 채무 한정 (저당만, 임대보증금 제외)
 *
 * SSOT: 담보채권액 입력은 EstateItem.mortgageAmount/leaseDeposit (재산평가 1곳).
 * 본 헬퍼는 §14 부채로 derive 합산만 — debtItems store에 쓰지 않음 (mirror-pattern).
 */

import type {
  EstateItem,
  HeirAllocation,
  DerivedCollateralDebt,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * E-1: 자산 분배(`assetAllocs`, amount 합=평가액)를 담보채무액(`collateralAmount`) 비율로 환산.
 * `resolveAllocationsByHeir`가 amount를 직접 합산하므로, 비율 환산 없이는 채무가 평가액만큼 분배되는 버그.
 * floor 잔액은 마지막 상속인이 흡수 → Σ = collateralAmount 보장 (feedback_floor_residual_absorption).
 */
export function scaleAllocations(
  assetAllocs: HeirAllocation[] | undefined,
  collateralAmount: number,
): HeirAllocation[] | undefined {
  if (!assetAllocs || assetAllocs.length === 0) return undefined;
  const denom = assetAllocs.reduce((s, a) => s + a.amount, 0);
  if (denom <= 0) return undefined;

  const result: HeirAllocation[] = [];
  let running = 0;
  for (let i = 0; i < assetAllocs.length; i++) {
    const a = assetAllocs[i];
    const isLast = i === assetAllocs.length - 1;
    const amount = isLast
      ? collateralAmount - running // 마지막 = 잔액 흡수
      : Math.floor((collateralAmount * a.amount) / denom);
    running += amount;
    result.push({ heirId: a.heirId, amount });
  }
  return result;
}

/**
 * EstateItem[] 중 `deductSecuredClaimAsDebt===true`인 항목의 담보채권액을 §14 부채로 파생.
 * - amount(§14) = mortgageAmount + leaseDeposit (피상속인 채무 전부)
 * - financialDebtAmount(§22) = securedClaimIsFinancialDebt ? mortgageAmount : 0 (저당만)
 * - heirAllocations = 연결 자산 분배를 amount 비율로 환산 (E-1)
 */
export function deriveCollateralDebts(
  items: EstateItem[] | undefined,
): DerivedCollateralDebt[] {
  if (!items || items.length === 0) return [];
  const result: DerivedCollateralDebt[] = [];
  for (const item of items) {
    if (item.deductSecuredClaimAsDebt !== true) continue; // opt-in 가드
    // §14①3호: 차감 채무는 "피상속인이 진 채무"에 한정. deposit(전세보증금 반환채권)은
    // 피상속인=임차인이 반환받을 채권(자산)이므로 담보채무로 파생 금지.
    // 동일 leaseDeposit이 자산+채무 이중계상되어 과세표준이 소멸하는 유령채무 방어(stale store).
    if (item.category === "deposit") continue;
    const mortgage = item.mortgageAmount ?? 0;
    const lease = item.leaseDeposit ?? 0;
    const amount = mortgage + lease;
    if (amount <= 0) continue; // 0 가드
    result.push({
      estateItemId: item.id,
      creditorName: item.securedClaimCreditorName || `${item.name} 담보채무`,
      amount,
      financialDebtAmount: item.securedClaimIsFinancialDebt ? mortgage : 0,
      heirAllocations: scaleAllocations(item.heirAllocations, amount),
    });
  }
  return result;
}

/** §14 자동공제 합계 */
export function sumCollateralDebt(derived: DerivedCollateralDebt[]): number {
  return derived.reduce((s, d) => s + d.amount, 0);
}

/** §22 순금융 차감 대상(저당분) 합계 */
export function sumCollateralFinancialDebt(
  derived: DerivedCollateralDebt[],
): number {
  return derived.reduce((s, d) => s + d.financialDebtAmount, 0);
}

/**
 * 파생 담보채무 → DebtItem[] 변환 (협의분할 calcHeirAllocation 합산용).
 * category="personal" 고정 — §22 차감은 별도 financialDebtAmount 경로(suggest)에서 처리하므로
 * 여기서 financial로 두면 calcHeirAllocation 외 경로의 §22 중복 차감 위험을 차단.
 * heirAllocations는 이미 비율 환산됨(scaleAllocations).
 */
export function toCollateralDebtItems(
  derived: DerivedCollateralDebt[],
): DebtItem[] {
  return derived.map((d) => ({
    id: `collateral_${d.estateItemId}`,
    category: "personal" as const,
    name: d.creditorName,
    amount: d.amount,
    heirAllocations: d.heirAllocations,
  }));
}
