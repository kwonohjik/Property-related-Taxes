/**
 * 지방소득세(양도소득분) 표시 — **단일 소스**.
 *
 * 지방세법 §103의3의 과세표준은 「결정세액 + 「소득세법」 §114조의2 환산가액적용가산세」다.
 * 국세기본법 §47의2~§47의4 **신고불성실·납부지연 가산세는 과세표준에서 제외**된다.
 * 엔진 3종이 모두 이 축이고 각각 주석으로 명시돼 있다:
 *   · 단건 `transfer-tax-finalize.ts` STEP 11 — applyRate(determinedTax + penaltyTax, 0.1)
 *   · 집계 `transfer-tax-aggregate.ts`  STEP M-10 — applyRate(determinedTax + perAssetBuildingPenalty, 0.1)
 *   · 겸용 `transfer-tax-mixed-use-totals.ts` — applyRate(determinedTax, 0.10) (겸용엔 §114조의2가 없다)
 *
 * 🔴 **왜 이 파일이 생겼나** — 종전에는 표시부가 이 값을 **네 벌로 다시 계산**했고 그중 셋이
 * 국기법 가산세를 base에 넣었다. 「지방소득세 산출세액」이 「지방세 결정세액」보다 큰데
 * 사이의 「지방세 감면세액」은 0이라, 화면이 스스로 반증하는 등식을 출력했다.
 *
 * ⚠️ **값은 다시 계산하지 않는다.** 지방세 감면세액은 전 경로에서 0 하드코딩이므로
 * 「산출세액 ≡ 결정세액 ≡ 엔진 `localIncomeTax`」다. 두 번째 계산은 드리프트만 만든다.
 * 이 모듈이 제공하는 것은 **산식 문구에 쓸 §114조의2분 해석**뿐이다.
 *
 * anchor: `__tests__/components/transfer-local-tax-base.anchor.test.ts`
 */
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** 지방소득세 과세표준에 산입되는 가산세(§114조의2분). 어댑터 result는 `localTaxPenalty`가 정본. */
export function localTaxablePenaltyOf(
  result: Pick<TransferTaxResult, "penaltyTax" | "localTaxPenalty">,
): number {
  return result.localTaxPenalty ?? result.penaltyTax;
}

/**
 * 「지방소득세 산출세액」 산식 문구.
 * §114조의2 가산세가 없으면 가산세 항을 넣지 않는다 — 0을 적으면 「무슨 가산세인가」가 흐려진다.
 */
export function localCalculatedTaxFormula(determinedTax: number, section114_2Penalty: number): string {
  const base =
    section114_2Penalty > 0
      ? `(결정세액 ${determinedTax.toLocaleString()} + §114조의2 가산세 ${section114_2Penalty.toLocaleString()})`
      : `결정세액 ${determinedTax.toLocaleString()}`;
  return `${base} × 10% (국세기본법 신고불성실·납부지연 가산세는 과세표준 제외)`;
}
