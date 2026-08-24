/**
 * 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 — 순수 leaf
 *
 * ## 법령 (KoreanLaw MCP 실측)
 *
 * **소득세법 시행령 §164⑧** — *"보유기간중 새로운 기준시가가 고시되지 아니함으로써 …
 * 양도당시의 기준시가와 취득당시의 기준시가가 동일한 경우에는 … 재정경제부령이 정하는
 * 방법에 의하여 계산한 가액을 양도당시의 기준시가로 한다."*
 *
 * **소득세법 시행규칙 §80①** — 그 "재정경제부령이 정하는 방법":
 *  - 1호: 취득일이 속하는 연도의 **다음 연도 말일 이전**에 양도하는 경우
 *    - 가목: 양도일까지 새 기준시가 미고시
 *      `양도당시 = 취득당시 + (취득당시 − 전기) × [보유월수 / 조정월수(100분의 100 한도)]`
 *    - 나목: 양도일부터 2월이 되는 날이 속하는 월의 말일까지 새 기준시가가 고시된 경우로서
 *      **거주자가 이 산식을 적용해 확정신고를 하는 경우**(납세자 선택)
 *      `양도당시 = 취득당시 + (새로운 − 취득당시) × (보유월수 / 조정월수)`
 *    - **단서(본문)**: 각 목 산식으로 계산한 값이 취득당시보다 적으면 → 취득당시
 *  - 2호: 1호 외의 경우 → **취득당시의 기준시가**
 *
 * ## 이 저장소에 이미 있는 것과의 관계
 *
 * `building-standard-price.ts:426`이 §164⑧을 구현하고 있으나 트리거가
 * `transferYear === acquisitionYear`(연도 동일)로 **법문보다 좁다** — 법정 요건은
 * "취득 연도의 다음 연도 말일 이전"이라 연도가 달라도 성립한다.
 * 또 그 구현은 §99①1호나목 **건물**에만 닿아 토지·주택·공동주택·오피스텔·상가에는 없다.
 * 본 모듈은 자산 종류를 모르는 **도메인 무관 leaf**로, 호출부가 사실(fact)만 넘긴다.
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import { TRANSFER } from "./legal-codes/transfer";

/** §80①1호 각 목 — 가목(전기 대비) | 나목(새 고시 대비) */
export type SameAdjustmentPeriodFormula = "prev" | "new";

/** §80① 적용 구분 */
export type SameAdjustmentPeriodClass =
  /** §80①1호 — 가·나목 산식 대상 */
  | "clause_1"
  /** §80①2호 — 취득당시의 기준시가를 그대로 양도당시 기준시가로 */
  | "clause_2"
  /** §164⑧ 미해당 — 두 기준시가가 다르다. 입력값을 건드리지 않는다 */
  | "not_applicable";

/**
 * 「기준시가 조정월수·보유기간 월수」 — 시행규칙 §80⑤ + 예규(재산 46014-205, 2002.12.18.).
 *
 * §80⑤ *"1월미만의 일수는 1월로 한다"* → 끝수를 **절상**한다.
 * 예규가 **초일을 산입**하도록 하므로 만료일 기준을 하루 뒤로 밀어 계산한다.
 *
 * 🔴 **「보유기간 월수」는 이 저장소에 두 축이 있다 — 혼용 금지**
 *  - **§80⑤ 축(절상)** = 본 함수. 기준시가 조정월수·§80① 보유월수 전용
 *  - **§95·§104 축(내림)** = `transfer-tax-aggregate-helpers.ts` `monthsBetween`
 *    (장기보유특별공제·세율 판정의 보유기간). **손대지 않는다**
 *  - 상증 사업연도 환산 = `property-valuation/fiscal-year-annualize.ts`. 무관
 *
 * 이름을 `monthsBetween`으로 짓지 않은 이유가 이것이다.
 */
export function calcStdPriceMonths(from: Date, to: Date): number {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) return 0;
  if (!(to instanceof Date) || Number.isNaN(to.getTime())) return 0;
  if (to.getTime() <= from.getTime()) return 0;

  // 만 `m`개월이 되는 날 = 초일산입 기산일의 응당일 **전일**(민법 §160②).
  // 최종 월에 해당일이 없으면 그 월의 **말일**로 만료한다(§160③) — 1/31 + 1월 = 2/28.
  const expiryOf = (m: number): Date => {
    const index = from.getMonth() + m;
    const year = from.getFullYear() + Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return from.getDate() > lastDay
      ? new Date(year, month, lastDay) // §160③ 해당일 없음 → 말일이 만료일
      : new Date(year, month, from.getDate() - 1); // §160② 응당일 전일
  };

  // 완전히 경과한 개월 수 = expiry(m) ≤ 양도일을 만족하는 최대 m.
  // expiry(0) = 취득일 전일이라 항상 성립하므로 루프는 반드시 종료한다.
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  while (months > 0 && expiryOf(months).getTime() > to.getTime()) months -= 1;

  // 만료일을 넘겨 남은 일수가 있으면 §80⑤로 1월 절상. 전체가 1월 미만이어도 1월.
  const hasRemainder = to.getTime() > expiryOf(months).getTime();
  return Math.max(months + (hasRemainder ? 1 : 0), 1);
}

/** `classifySameAdjustmentPeriod` 입력 — 자산 종류에 의존하지 않는 사실만 받는다 */
export interface SameAdjustmentPeriodFacts {
  /** 취득당시의 기준시가 (원) */
  standardPriceAtAcquisition: number;
  /**
   * 양도당시의 기준시가 (원) — **§164③(새 기준시가 고시 전이면 직전 고시분) 적용 후** 값.
   * 두 값이 같아지는 것 자체가 §164③의 귀결이다.
   */
  standardPriceAtTransfer: number;
  acquisitionDate: Date;
  transferDate: Date;
}

/**
 * §164⑧ + §80①1호 — 적용 요건 **2단** 판정.
 *
 * 🔑 **트리거 정본은 「두 기준시가 값이 같은가」다** — 고시일자 일치가 아니다.
 *    §164⑧ 문언이 *"양도당시의 기준시가와 취득당시의 기준시가가 동일한 경우"*이기 때문이다.
 *    자동 조회 경로에서 고시일자가 같다는 사실은 **UI 사전 안내에만** 쓰고 판정에는 쓰지
 *    않는다 — 판정축을 둘로 만들면 수동 입력 경로와 dual-truth가 된다.
 *
 * 기간 요건(§80①1호 본문)은 *"취득일이 속하는 연도의 **다음 연도 말일** 이전 양도"*이므로
 * `양도연도 ≤ 취득연도 + 1`과 동치다(말일 = 그 해 12월 31일).
 */
export function classifySameAdjustmentPeriod(
  facts: SameAdjustmentPeriodFacts,
): SameAdjustmentPeriodClass {
  const { standardPriceAtAcquisition: acq, standardPriceAtTransfer: tsf } = facts;

  // 방어 — 기준시가가 없으면 판정 대상이 아니다.
  if (!(acq > 0) || !(tsf > 0)) return "not_applicable";

  // ① §164⑧ — 양도당시 기준시가 == 취득당시 기준시가
  if (acq !== tsf) return "not_applicable";

  const { acquisitionDate, transferDate } = facts;
  if (
    !(acquisitionDate instanceof Date) || Number.isNaN(acquisitionDate.getTime()) ||
    !(transferDate instanceof Date) || Number.isNaN(transferDate.getTime())
  ) {
    return "not_applicable";
  }

  // ② §80①1호 본문 — 취득일이 속하는 연도의 다음 연도 말일 이전 양도
  return transferDate.getFullYear() <= acquisitionDate.getFullYear() + 1
    ? "clause_1"
    : "clause_2";
}

export interface SameAdjustmentPeriodArgs {
  formula: SameAdjustmentPeriodFormula;
  /** 취득당시의 기준시가 (원) */
  standardPriceAtAcquisition: number;
  /** 가목 — 전기의 기준시가 (§80②2호). §80③ 대체 산정값도 여기로 넣는다 */
  priorStandardPrice?: number;
  /** 나목 — 새로운 기준시가 */
  newStandardPrice?: number;
  /** 양도자산의 보유기간 월수 (§80⑤ 적용 후) */
  holdingMonths: number;
  /** 기준시가 조정월수 (§80②1호) */
  adjustmentMonths: number;
  /**
   * §80①1호 본문 단서(하한) 적용 여부. **기본 true**(§164⑧ 본체).
   *
   * `false`는 §164⑥ 준용(`commercial-building-valuation.ts`) 전용이다 — 그 경로가 구하는
   * 값은 「양도당시」가 아니라 「**취득**당시 기준시가의 분모」라 단서의 대상이 아니고,
   * 2026-07-28에 **미적용으로 결정**됐다(명문 없는 불리 적용 금지).
   */
  applyFloor?: boolean;
}

export interface SameAdjustmentPeriodResult {
  /** 양도당시의 기준시가 (원, 정수) */
  value: number;
  /** 100분의 100 한도가 실제로 발동했는가 (가목 전용) */
  capApplied: boolean;
  /** §80①1호 단서로 취득당시 기준시가가 채택됐는가 */
  flooredToAcquisition: boolean;
  legalBasis: string;
}

/**
 * §80①1호 가목·나목 산식 + 본문 단서(하한).
 *
 * ## 정수 연산 (프로젝트 원칙 + 실측 근거)
 *
 * 1. **`delta ≤ 0`이면 곱셈 없이 취득당시를 반환**한다(`applyFloor` 시).
 *    delta < 0(하락장)이면 결과가 반드시 취득당시보다 작아 어차피 단서로 취득당시가 된다.
 *    이 단락은 결과를 바꾸지 않으면서 **음수 경로를 통째로 제거**한다 —
 *    `safeMultiplyThenDivide`는 분자가 `MAX_SAFE_INTEGER`를 넘으면 BigInt 나눗셈
 *    (**0 방향 절사**)으로 빠지는데 그 아래에서는 `Math.floor`(**아래 방향**)라
 *    음수에서 두 경로가 1원 갈린다.
 * 2. **`applyRate(x, hold/adj)` 금지.** `hold/adj`는 이진 표현 불가 소수라 floor 직전
 *    ulp 아래로 떨어져 1원이 부족해진다. ⇒ 분수 정수 연산 `floor(delta × hold ÷ adj)`.
 * 3. cap(**가목 한정**)은 비율이 아니라 **월수**에 건다 — `min(hold, adj)`를 먼저 구한다.
 *    `min(hold/adj, 1)`을 먼저 계산하면 소수를 다시 만들어 2번의 취지가 무너진다.
 *
 * ## 파생 불변식 — 하한 발동 ⟺ `delta ≤ 0`
 * `delta > 0`이고 §80⑤로 `hold ≥ 1`이므로 결과는 **항상** 취득당시 이상이다.
 * 즉 단서가 발동하는 경우는 `delta ≤ 0`뿐이고 1번의 단락과 동치다.
 *
 * ## cap을 나목에 걸지 않는 이유
 * 법문상 100분의 100 한도는 **가목 산식 괄호 안에만** 있다. 나목 요건
 * (취득결정일 ≤ 취득일 · 양도일 < 새 결정일 ≤ 양도일+2월 속월 말일) 아래에서는
 * `보유월수 ≤ 조정월수`가 구조적으로 보장된다 — 20,199,325 조합 전수 실측 **위반 0건**.
 * 따라서 나목 cap 분기는 두지 않는다(법문 준수 + 도달 불가).
 */
export function calcSameAdjustmentPeriodStdPrice(
  args: SameAdjustmentPeriodArgs,
): SameAdjustmentPeriodResult {
  const {
    formula,
    standardPriceAtAcquisition: acq,
    holdingMonths,
    adjustmentMonths,
  } = args;
  const applyFloor = args.applyFloor ?? true;

  const clauseBasis =
    formula === "prev" ? TRANSFER.SAME_ADJ_PERIOD_CLAUSE_A : TRANSFER.SAME_ADJ_PERIOD_CLAUSE_B;
  const legalBasis = `${TRANSFER.SAME_ADJ_PERIOD_BASE} · ${clauseBasis}`;

  if (!(adjustmentMonths > 0)) {
    throw new Error("기준시가 조정월수가 0 이하입니다 (소득세법 시행규칙 §80②1호)");
  }

  const counterpart = formula === "prev" ? args.priorStandardPrice : args.newStandardPrice;
  if (counterpart === undefined || !(counterpart >= 0)) {
    throw new Error(
      formula === "prev"
        ? "가목 산식에는 전기의 기준시가가 필요합니다 (소득세법 시행규칙 §80②2호)"
        : "나목 산식에는 새로운 기준시가가 필요합니다 (소득세법 시행규칙 §80①1호나목)",
    );
  }

  // 가목: 취득당시 − 전기 / 나목: 새로운 − 취득당시
  const delta = formula === "prev" ? acq - counterpart : counterpart - acq;

  // 1. delta ≤ 0 단락 — 단서와 동치. 음수 곱셈 경로를 만들지 않는다.
  if (applyFloor && delta <= 0) {
    return {
      value: acq,
      capApplied: false,
      flooredToAcquisition: true,
      legalBasis: `${legalBasis} · ${TRANSFER.SAME_ADJ_PERIOD_FLOOR}`,
    };
  }

  // 3. cap은 가목 전용 · 월수에 건다
  const capEligible = formula === "prev";
  const capApplied = capEligible && holdingMonths > adjustmentMonths;
  const effectiveMonths = capApplied ? adjustmentMonths : holdingMonths;

  // 2. 분수 정수 연산. 부호는 크기 계산 후 되붙여 양·음 경로를 하나로 유지한다.
  const magnitude = safeMultiplyThenDivide(Math.abs(delta), effectiveMonths, adjustmentMonths);
  const adjustment = delta >= 0 ? magnitude : -magnitude;

  return {
    value: Math.floor(acq + adjustment),
    capApplied,
    flooredToAcquisition: false,
    legalBasis,
  };
}
