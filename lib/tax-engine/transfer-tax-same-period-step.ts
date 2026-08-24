/**
 * 동일조정기간 내 취득·양도 — 「양도당시 기준시가」 환산 (transfer-tax.ts STEP 0.47)
 *
 * 소득세법 시행령 §164⑧ · 시행규칙 §80①~⑤.
 *
 * ## 왜 여기인가 — 단일 정규화 choke point
 *
 * `standardPriceAtTransfer`의 **기록 지점이 28곳 이상**(`lib/calc/*` · `app/api/calc/transfer/*` ·
 * `components/calc/transfer/*`)이라 개별 패치는 반드시 누락을 만든다. 대신 기준시가가 **확정된
 * 직후** 한 곳에서 정규화하면 단건 엔진의 모든 다운스트림 소비자 — 환산취득가액·기준시가 과세·
 * 감면 안분·장기보유특별공제·중과 판정 — 가 자동으로 따라온다.
 *
 * ```
 * STEP 0.4   pre1990Land        → standardPriceAtAcquisition 주입 (§164④)
 * STEP 0.45  inheritedAcq       → standardPriceAtDeemedDate/Transfer 주입 (§163⑨)
 * STEP 0.42  familyBusiness     → 조기 반환(내부에서 재귀 호출 → 0.47 우회 없음)
 * STEP 0.46  acquisitionOverride
 * STEP 0.47  ★ 여기 — §164⑧ 정규화
 * ```
 *
 * ## 수용 §164⑨와의 순서
 *
 * §164⑨은 *"법 §99①1호 가목부터 라목까지의 규정에 따른 가액**에서 차감**"*이므로
 * §164⑧ 환산이 **끝난 값**에서 보상액 차액을 뺀다. 그 계산은
 * `transfer-tax-expropriation-valuation.ts`가 `input.standardPriceAtTransfer`를 읽어 수행하므로
 * STEP 0.47이 그보다 앞서는 것으로 순서가 성립한다.
 *
 * 순환 의존 방지: 이 파일은 `transfer-tax.ts`를 import하지 않는다.
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md
 */

import {
  calcStdPriceMonths,
  classifySameAdjustmentPeriod,
  calcSameAdjustmentPeriodStdPrice,
} from "./same-adjustment-period-std-price";
import { TRANSFER } from "./legal-codes/transfer";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/** §80②1호 조정월수 통상값 — 연 1회 고시 */
const DEFAULT_ADJUSTMENT_MONTHS = 12;

export interface SamePeriodStepResult {
  updatedInput: TransferTaxInput;
  step: CalculationStep;
}

/**
 * §164⑧ 정규화 — 요건 미충족이면 `undefined`(호출부 no-op).
 *
 * 반환값이 `undefined`인 경우가 셋이다:
 *  1. `sameAdjustmentPeriod` 미제공 — 기능 자체가 꺼져 있다
 *  2. §164⑧ 미해당 — 취득·양도 기준시가가 다르다(`not_applicable`)
 *  3. §80①2호 — 요건 기간을 벗어났다. 이때 양도당시 기준시가는 **취득당시 기준시가**인데,
 *     §164⑧ 트리거가 선 시점에 두 값이 이미 같으므로 **치환할 것이 없다**.
 *     계산은 그대로 두고 산출근거 step만 남긴다.
 */
export function runSameAdjustmentPeriodStep(
  input: TransferTaxInput,
): SamePeriodStepResult | undefined {
  const sap = input.sameAdjustmentPeriod;
  if (!sap) return undefined;

  const acq = input.standardPriceAtAcquisition;
  const tsf = input.standardPriceAtTransfer;
  if (acq === undefined || tsf === undefined) return undefined;

  const verdict = classifySameAdjustmentPeriod({
    standardPriceAtAcquisition: acq,
    standardPriceAtTransfer: tsf,
    acquisitionDate: input.acquisitionDate,
    transferDate: input.transferDate,
  });

  if (verdict === "not_applicable") return undefined;

  if (verdict === "clause_2") {
    // §80①2호 — 취득당시의 기준시가. 트리거 성립 시점에 tsf === acq이므로 값 변화 없음.
    return {
      updatedInput: input,
      step: {
        label: "동일조정기간 양도 — 환산 미적용 (§80①2호)",
        formula:
          `취득일(${fmtDate(input.acquisitionDate)})이 속하는 연도의 다음 연도 말일 이후 양도 → ` +
          `양도당시 기준시가 = 취득당시 기준시가 ${acq.toLocaleString()}`,
        amount: acq,
        legalBasis: `${TRANSFER.SAME_ADJ_PERIOD_BASE} · ${TRANSFER.SAME_ADJ_PERIOD_CLAUSE_2}`,
      },
    };
  }

  // §80①1호 — 가·나목 산식
  const formula = sap.formula ?? "prev";
  const adjustmentMonths = sap.adjustmentMonths ?? DEFAULT_ADJUSTMENT_MONTHS;
  const holdingMonths = calcStdPriceMonths(input.acquisitionDate, input.transferDate);

  const counterpart = formula === "prev" ? sap.priorStandardPrice : sap.newStandardPrice;
  // 필요한 상대 기준시가가 없으면 산정 불가 — 조용히 틀린 값을 만들지 않고 현행을 유지한다.
  // (입력 검증은 ⑧ validation이 담당한다. 엔진은 방어만 한다.)
  if (counterpart === undefined || !(counterpart >= 0)) return undefined;
  if (!(holdingMonths > 0) || !(adjustmentMonths > 0)) return undefined;

  const converted = calcSameAdjustmentPeriodStdPrice({
    formula,
    standardPriceAtAcquisition: acq,
    priorStandardPrice: sap.priorStandardPrice,
    newStandardPrice: sap.newStandardPrice,
    holdingMonths,
    adjustmentMonths,
  });

  const clauseLabel = formula === "prev" ? "가목" : "나목";
  const deltaText =
    formula === "prev"
      ? `(취득당시 ${acq.toLocaleString()} − 전기 ${counterpart.toLocaleString()})`
      : `(새로운 ${counterpart.toLocaleString()} − 취득당시 ${acq.toLocaleString()})`;

  const formulaText = converted.flooredToAcquisition
    ? `${deltaText}이 0 이하 → 계산값이 취득당시 기준시가보다 적으므로 ` +
      `취득당시 기준시가 ${acq.toLocaleString()}을 양도당시 기준시가로 한다 (§80①1호 단서)`
    : `취득당시 ${acq.toLocaleString()} + ${deltaText} × ` +
      `보유월수 ${holdingMonths}${converted.capApplied ? `(조정월수 ${adjustmentMonths} 한도 적용)` : ""}` +
      ` ÷ 조정월수 ${adjustmentMonths} = ${converted.value.toLocaleString()}`;

  return {
    updatedInput: { ...input, standardPriceAtTransfer: converted.value },
    step: {
      label: `동일조정기간 양도당시 기준시가 환산 (§80①1호${clauseLabel})`,
      formula: formulaText,
      amount: converted.value,
      legalBasis: converted.legalBasis,
    },
  };
}

function fmtDate(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
