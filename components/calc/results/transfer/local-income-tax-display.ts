/**
 * 지방소득세(양도소득분) 표시 — **단일 소스**.
 *
 * ## 조문 축 (🔴 G-29 정정)
 *
 * 「지방세법」 §103의3은 **세율** 조항이고 그 곱하는 대상은 §103②이 정한 **양도소득과세표준**
 * (=「소득세법」 §92에 따라 계산한 소득세의 과세표준)이다 — 「과세표준 = 결정세액 + 가산세」라는
 * 조문은 존재하지 않는다. 조문대로의 계보는 §103의2다:
 *
 *   1호 과세표준(§103②) × 세율(§103의3) = **산출세액**
 *   2호 산출세액 − 감면(§103의4)         = **결정세액**
 *   3호 결정세액 + §103의8 · §103의9② · 「지방세기본법」 §53~§55 가산세 = **총결정세액**
 *
 * 「소득세법」 §114조의2 환산가액적용가산세분이 지방소득세에 반영되는 근거는 §103의3이 아니라
 * **§103의9②**다 — 「감정가액 또는 환산취득가액의 **1천분의 5**에 해당하는 금액을 … 결정세액에
 * 더한다」. 소득세 §114조의2가 환산취득가액의 5%이므로 그 10분의 1과 값이 같고, 그래서 엔진의
 * `(결정세액 + §114조의2 가산세) × 10%`가 조문대로의 `결정세액 × 10% + 환산취득가액 × 0.5%`와
 * 우연히 일치한다. **값은 맞지만 근거는 §103의9②다.**
 *
 * 국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세는 §103의2 3호의 열거(§103의8 ·
 * §103의9② · 지방세기본법 §53~§55)에 **없다** — 그래서 지방소득세에 더해지지 않는다.
 * (§103의8은 더할 국세 가산세로 「소득세법」 §115만 열거하고 §114조의2는 열거하지 않는다.)
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

/**
 * 지방소득세 결정세액에 가산되는 가산세(§114조의2분 — 지방세법 §103의9②).
 * 어댑터 result는 `localTaxPenalty`가 정본.
 */
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
  // ⚠️ 묶음(`(a + b) × 10%`)을 풀지 않는다 — 항별로 나눠 적으면 절사가 두 번 일어나 엔진
  //    `applyRate(determinedTax + penalty, 0.1)` 값과 1원 어긋날 수 있다(표시 드리프트).
  const note = "국세기본법 §47의2~§47의4 가산세는 대상이 아니다";
  if (section114_2Penalty > 0) {
    // ⚠️ 여는 괄호와 닫는 괄호를 **같은 줄**에 둔다 — 결과탭 표시 규약 anchor
    //    (`transfer-result-display-convention.anchor.test.ts` D-2)가 줄 단위로 검사한다.
    const d = determinedTax.toLocaleString();
    const p = section114_2Penalty.toLocaleString();
    const base = `(결정세액 ${d} + 소득세법 §114조의2 가산세 ${p}) × 10%`;
    const basis = "§114조의2분의 근거는 지방세법 §103의9②(환산·감정취득가액 × 0.5%)";
    return `${base} — ${basis}이며, ${note}`;
  }
  return `결정세액 ${determinedTax.toLocaleString()} × 10% — ${note}`;
}
