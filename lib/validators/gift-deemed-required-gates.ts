/**
 * 증여로 보는 경우 — ⑧(`lib/calc/gift-deemed-validate*.ts`)과 ⑫(`gift-deemed-input-required-refines.ts`)가
 * **같이 쓰는 필수 입력 게이트**. 한쪽만 고치면 화면과 API가 서로 다른 값을 요구하게 된다(3중 패턴).
 * 값의 표현(폼 문자열 ↔ 와이어 숫자)은 호출자가 맞춰 넘긴다 — 여기에는 «언제 필요한가»만 둔다.
 */

/** §33①2호 — 수익권 증여시기. 원본만 타인(`diff_principal`)이면 수익권은 증여가 아니다 */
export function trustNeedsIncomeGiftDate(beneficiaryType: string): boolean {
  return beneficiaryType !== "diff_principal";
}

/** §33①1호 — 원본권 증여시기. 수익만 타인(`diff_income`)이면 원본권은 증여가 아니다 */
export function trustNeedsPrincipalGiftDate(beneficiaryType: string): boolean {
  return beneficiaryType !== "diff_income";
}

/** 상증령 §62 2호 종신정기금 — 기대여명(직접) 또는 성별·연령(통계표 조회) 중 하나가 있어야 회차가 정해진다 */
export function trustLifetimeInputsComplete(remainingYears: number, gender: string | undefined, age: number): boolean {
  return remainingYears > 0 || (!!gender && age > 0);
}

/** §40①2호 가~라목(주식전환) — 교부주식가액(§30⑤1)을 구하는 입력이 필요한 갈래 */
export function bondNeedsConversionInputs(caseType: string | undefined): boolean {
  return caseType === "conversion" || caseType === "conversion_reverse";
}

/** 상증칙 §10의2(2016.2.4 이전 분할합병) — 순자산비율 평가면 과대평가 1주평가 대신 분할 3필드를 쓴다 */
export function mergerSplitUsesNetAssetRatio(isSplitMerger: boolean | undefined, mode: string | undefined): boolean {
  return !!isSplitMerger && mode === "net_asset_ratio";
}

/** §39①3호 전환주식 고가 — 가목(실권주 재배정) 외 갈래는 두 시점 모두 비율 인자(분자·분모)가 필요하다 */
export function convertibleStockNeedsRatioInputs(direction: string | undefined, subType: string | undefined): boolean {
  return direction === "high" && subType !== "forfeited_realloc";
}
