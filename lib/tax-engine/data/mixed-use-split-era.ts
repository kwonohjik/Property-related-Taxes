/**
 * 겸용주택 분리계산의 **양도일 시행일** (정적 상수).
 *
 * 「소득세법 시행령」 제160조 제1항 괄호(주택 외의 부분은 주택으로 보지 않는다)는 2022.1.1. 이후 양도분부터 적용된다
 * (부칙 근거는 `mixed-use-burdened-gift-prepare.ts`의 같은 날 상수 주석). 엔진은 그 전 양도의 겸용주택을 분리계산하지 않고 거부한다
 * (`transfer-tax-mixed-use.ts` STEP 1 — 종전 규정 계산은 구현하지 않았다).
 *
 * 엔진 STEP 1 · ⑧ `validateMixedUseAsset`이 **이 함수 하나**로 판정한다 — 둘이 갈리면 화면은 통과시키고 엔진은 0으로 거부한다.
 * (부담부증여 겸용의 같은 날 상수 `mixed-use-burdened-gift-prepare.ts`와 화면 안내 `MixedUseSection.tsx`의 문자열 비교는
 *  동작이 같아 이번에 옮기지 않았다 — 계획서 `docs/00-pm/transfer-nbl-deferral-derived-followups.plan.md` §7.)
 */
export const MIXED_USE_SPLIT_FROM = "2022-01-01";

const MIXED_USE_SPLIT_FROM_TIME = new Date(MIXED_USE_SPLIT_FROM).getTime();

/**
 * 양도일이 겸용주택 분리계산 대상(2022.1.1. 당일 포함 이후)인가.
 * - 문자열(폼 `YYYY-MM-DD`): 날짜 문자열 비교.
 * - `Date`(엔진 입력 — route가 `new Date("YYYY-MM-DD")`로 만든 UTC 자정): 종전 엔진 비교(`transferDate < new Date("2022-01-01")`)와 같은 시각 비교.
 */
export function isMixedUseSplitTransfer(transferDate: string | Date): boolean {
  if (typeof transferDate === "string") return transferDate.slice(0, 10) >= MIXED_USE_SPLIT_FROM;
  return transferDate.getTime() >= MIXED_USE_SPLIT_FROM_TIME;
}
