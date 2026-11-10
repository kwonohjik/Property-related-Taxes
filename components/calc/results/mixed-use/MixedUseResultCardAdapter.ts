/**
 * 겸용주택 결과 카드 — **어댑터·표시 파생 헬퍼**.
 *
 * `MixedUseResultCard.tsx`에서 분리(800줄 정책). 순수 함수만 두며 JSX는 없다.
 * `mixedUseToFilingResult`는 신고서·명세서 컴포넌트가 기대하는 `TransferTaxResult` 형상으로
 * 겸용 결과를 변환한다.
 */

import type {
  MixedUseGainBreakdown,
  MixedUseStep,
  MixedUseTotalTax,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { CalculationStep, TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { mixedUseDisplayedAcqPrice } from "@/lib/calc/mixed-use-part-acq-split";

const stepValueText = (v: number | string) => (typeof v === "number" ? v.toLocaleString("ko-KR") : v);

/**
 * 「전체 엔진 계산 과정」 표에 싣는 겸용 step id (허용 목록).
 * **보류(미렌더)**: `step-5-housing`(주택부분) · `step-7-commercial`(상가부분) · `step-6-non-business-land`(비사업용토지 부분) —
 * 별개 취득(`separateAcquisition`)에서도 「환산취득가액」 라벨이 붙고 장기보유 율 문구가 4부분 가중과 다르다.
 * 설계서 `transfer-split-acq-result-display.engine.design.md` §6(Q-C6). anchor T-5가 보류 step 미렌더를 지킨다.
 */
export const MIXED_USE_RENDERED_STEP_IDS: ReadonlySet<string> = new Set([
  "step-0-burdened-gift",
  "step-2-apportionment",
  "income-deduction-new-housing",
  "surcharge-exclusion-by-reduction",
  "step-9-total",
]);

/**
 * 겸용 엔진 step(`MixedUseStep` — id/title/legalBasis/values) → 단건 `CalculationStep`(label/formula/amount) 변환.
 * 「전체 엔진 계산 과정」 표(명세서 카드 `EngineStepsSubToggle`)가 겸용에서도 엔진 step을 그대로 싣도록 한다. 표시 전용 — 세액 불변.
 *
 * 허용 목록(`MIXED_USE_RENDERED_STEP_IDS`) 밖의 step은 싣지 않는다.
 *
 * `amount` 규칙은 단건 관례를 따른다(`buildIncomeDeductionStep` · `buildSurchargeExclusionStep`):
 *  · 숫자 결과 행(`isResult`)이 하나면 그 값 — `formula`는 결과가 아닌 행을 「라벨 값」으로 이은 문장
 *    (행이 하나뿐인 step은 그 행의 라벨이 곧 산식이다 — 예: 「양도소득금액 A - 감면 양도소득금액 B = C」).
 *  · 숫자 결과 행이 없거나 문자열 결과(「중과 배제」)면 `amount` 0 — 단건의 안내·배제 step(`amount: 0`)과 같다. 설명은 `formula`에 싣는다.
 *  · 숫자 결과 행이 둘 이상이면(양도가액 안분의 주택·상가 양도가액) 결과 행마다 step 하나(`제목 — 행 라벨`)로 나눈다 —
 *    `CalculationStep`은 금액이 하나라서다. 입력 행 산식은 첫 step에만 싣는다.
 */
export function mixedUseStepsToCalculationSteps(steps: readonly MixedUseStep[]): CalculationStep[] {
  const out: CalculationStep[] = [];
  for (const st of steps) {
    if (!MIXED_USE_RENDERED_STEP_IDS.has(st.id)) continue;
    const numericResults = st.values.filter((v) => v.isResult && typeof v.value === "number");
    const inputs = st.values.filter((v) => !numericResults.includes(v));
    const inputText = inputs.map((v) => `${v.label} ${stepValueText(v.value)}`).join(", ");
    if (numericResults.length >= 2) {
      numericResults.forEach((r, i) => {
        out.push({
          label: `${st.title} — ${r.label}`,
          formula: i === 0 ? inputText : "",
          amount: r.value as number,
          legalBasis: st.legalBasis,
        });
      });
      continue;
    }
    const only = numericResults[0];
    out.push({
      label: st.title,
      formula: st.values.length === 1 ? st.values[0].label : inputText,
      amount: only ? (only.value as number) : 0,
      legalBasis: st.legalBasis,
    });
  }
  return out;
}

/** MixedUseGainBreakdown → TransferTaxResult 어댑터 (FilingFormTable 호환) */
export function mixedUseToFilingResult(b: MixedUseGainBreakdown): TransferTaxResult {
  const t = b.total;
  const localTax = t.localTax;
  // 취득 모드 판별 — 본문 계산 섹션(isDeemedAcq)과 동일 기준. 실가(§100²·§97①1호가목)·상속/증여
  // 의제(§163⑨)는 실제 취득가액을 표시(개산공제 미표시), 환산·감정/매매사례(§176의2 추계)는 추계 분기.
  const acqRoute = b.calculationRoute.acquisitionConversionRoute;
  // B1 — 별개 취득 파트 모델은 route가 갱신되지 않는다(`section97_direct`/`phd_corrected`). echo 유무가 먼저다.
  const sepEcho = b.separateAcquisition;
  const isDeemedOrActual =
    !sepEcho &&
    (acqRoute === "section97_actual" ||
    acqRoute === "inheritance_direct" ||
    acqRoute === "inheritance_phd_max" ||
    acqRoute === "gift_direct" ||
    acqRoute === "gift_phd_max");
  // 취득가액 = 주택분 + 상가분 (해당 모드 값이 estimatedAcquisitionPrice에 담김).
  // B1 파트 모델은 **실제로 차감되는 값**(echo 4부분 합 — 단서 나목 채택 파트는 0)이다. `estimatedAcquisitionPrice`는 단서 판정 전 합이라
  // 단서가 나목을 채택하면 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 깨진다.
  const acqPrice = mixedUseDisplayedAcqPrice(b);
  // 필요경비 = 개산공제 합계(환산·감정/매매사례) 또는 실제 필요경비(의제) — appraisalDed 필드가 담음. 실가는 0.
  // 상세명세서 실가 분기(취득가액 = 양도가액 − 양도차익 − expenses)가 acqPrice를 정확히 역산하도록 전달.
  const acqDeduction =
    b.housingPart.landAppraisalDed +
    b.housingPart.buildingAppraisalDed +
    b.commercialPart.landAppraisalDed +
    b.commercialPart.buildingAppraisalDed;
  // 배율초과 비사업용토지 — 「소득세법」 제104조 제5항 본문 후단에 따라 **별개 자산으로 보아**
  // 산출세액을 계산하는 **과세** 대상이다. 주택분 안분과세분(`proratedTaxableGain`)은 비사토를
  // 이미 떼어낸 뒤의 값이므로 여기서 더하지 않으면 신고서의 「비과세 양도차익」으로 오계상된다.
  // ⚠️ `transferGain`은 비사토를 **이미 포함한 gross**(`hp.transferGain` = 안분 전 gainSplit 합)다
  //    — 더하면 이중계상이므로 건드리지 않는다.
  const nb = b.nonBusinessLandPart;
  const nbTaxableGain = nb?.transferGain ?? 0;
  const nbLtDeduction = nb?.longTermDeductionAmount ?? 0;
  // OH-17 — §154③ 본문으로 상가 부분까지 비과세면(`deemedHouseBy154_3Main`) 상가분은 과세대상이 아니다
  //   (배율 초과 토지 몫은 이미 `nonBusinessLandPart`에 들어 있다). 단 나중에 취득한 토지가 보유요건 미달이면(#2141) 그 토지분은
  //   과세다 — 엔진이 장특 0으로 소득금액에 실어 둔 값(`incomeAmount + longTermDeductionAmount` = 과세대상 차익)을 그대로 쓴다.
  const commercialTaxableGain = b.commercialPart.deemedHouseBy154_3Main
    ? b.commercialPart.incomeAmount + b.commercialPart.longTermDeductionAmount
    : b.commercialPart.transferGain;
  const taxableGain = b.housingPart.proratedTaxableGain + commercialTaxableGain + nbTaxableGain;
  const longTermHoldingDeduction =
    b.housingPart.longTermDeductionAmount + b.commercialPart.longTermDeductionAmount + nbLtDeduction;
  return {
    isExempt: false,
    transferGain: b.housingPart.transferGain + b.commercialPart.transferGain,
    taxableGain,
    usedEstimatedAcquisition: !isDeemedOrActual,
    // 환산·추계 분기: 취득가액(추계)·개산공제를 실제 값으로 표시. 실가/의제는 undefined(실가 역산 분기 사용).
    estimatedBase: isDeemedOrActual ? undefined : acqPrice,
    estimatedDeduction: isDeemedOrActual ? undefined : acqDeduction,
    expenses: acqDeduction,
    longTermHoldingDeduction,
    // 겸용은 주택분(표2 가능)·상가분(표1)·비사토(표1)가 서로 다른 공제율이라 단일 rate가 없음 —
    // 상단 요약 산식용 실효 blended rate = 장특공제 합계 ÷ 과세대상 양도차익 합계.
    longTermHoldingRate: taxableGain > 0 ? longTermHoldingDeduction / taxableGain : 0,
    lthdStartDate: new Date(0), // mixed-use 합산 mock: 표시용
    basicDeduction: t.basicDeduction,
    taxBase: t.taxBase,
    appliedRate: t.appliedRate,
    progressiveDeduction: t.progressiveDeduction,
    calculatedTax: adoptedCalculatedTax(t),
    isSurchargeSuspended: false,
    /**
     * 🔴 종전에는 이 네 줄이 **0 하드코딩**이었다(F17-B, 2026-08-23).
     *
     * 겸용 엔진에 감면·가산세 축 자체가 없어서 0이 «맞는» 값이었지만, 그래서 결과 카드에
     * 「감면 미적용」이라는 고지조차 없이 사용자가 고른 §77이 사라졌다. 엔진이 계산하게 된
     * 지금 그대로 두면 **계산과 표시가 갈린다**(memory `feedback_engine_result_display_drift`).
     */
    reductionAmount: t.reductionAmount,
    /**
     * ⑲ 세액감면대상금액 라우팅·§127⑦ 표시가 읽는 두 값 — 종전에는 어댑터가 싣지 않아
     * 신고서 ⑲가 **0**, 명세서 산식이 「감면 대상 없음」이라 같은 화면의 ⑮ 감면세액과
     * 자기모순이었다(결과탭 코드리뷰 #049).
     */
    reductionTypeApplied: t.reductionTypeApplied,
    reducibleIncome: t.reducibleIncome,
    // §77의2 ⑲는 `eligibleTransferIncome` echo를 읽으므로 detail도 함께 실어야 한다.
    ...(t.reductionDetails ?? {}),
    determinedTax: t.determinedTax,
    // §114조의2 환산가액적용가산세는 겸용 경로에 없다 — 신고불성실·납부지연만 온다
    // (`transfer-tax-mixed-use-totals.ts`: `penaltyTax: penalty?.totalPenalty ?? 0`).
    penaltyBase: 0,
    penaltyTax: t.penaltyTax,
    /**
     * 🔴 G-43: 가산세 **산출근거** 승계.
     *
     * 종전에는 이 슬롯이 비어 있어 결과 화면에 금액만 뜨고 세율·산정일수·기준금액 행이
     * 하나도 생성되지 않았다(`TransferTaxResultView.tsx:395`·`FilingFormTableHelpers.ts:650`이
     * `penaltyDetail`을 국기법 가산세의 근거로 읽는다). 세액은 위 `penaltyTax`가 정본이므로
     * 이 승계로 금액이 바뀌지는 않는다.
     */
    ...(t.penaltyDetail ? { penaltyDetail: t.penaltyDetail } : {}),
    /**
     * 지방소득세 과세표준 산입분 = **0**. 위 `penaltyTax` 슬롯이 담고 있는 것은 국기법
     * §47의2~§47의4 가산세이고, 그것은 지방세법 §103의2 3호 열거에 없어 지방소득세 대상이 아니다.
     * 겸용 엔진도 `applyRate(determinedTax, 0.10)`으로 가산세를 base에서 빼고 있다.
     * 이 필드가 없으면 신고서·명세서가 슬롯을 §114조의2로 오인해 base를 부풀린다.
     */
    localTaxPenalty: 0,
    localIncomeTax: localTax,
    // 겸용 엔진도 농특세를 산정해 `totalPayable`에 합산한다 — 승계하지 않으면 신고서·명세서에서 0이 된다.
    ruralSurtax: t.ruralSurtax,
    // NH-38 — 농특세 미납분 납부지연가산세(totalPayable에 이미 포함) — 승계하지 않으면 신고서 칸·요약이 0이 된다.
    ...(t.ruralSurtaxDelayedPenalty ? { ruralSurtaxDelayedPenalty: t.ruralSurtaxDelayedPenalty } : {}),
    // US-29 — 지방소득세 가산세(totalPayable에 이미 포함) — 승계하지 않으면 결과뷰·명세서가 합계와 어긋난다.
    ...(t.localIncomePenalty ? { localIncomePenalty: t.localIncomePenalty } : {}),
    totalTax: t.totalPayable,
    // b.steps는 MixedUseStep[] (id/title/legalBasis/values 구조)라 형태를 변환해 싣는다 — 명세서 카드의
    // 「전체 엔진 계산 과정」 표가 겸용에서도 §99·§99의3 차감 step을 포함해 보인다(표시 전용).
    // 라벨은 step 제목(「주택부분」·「합산 세액」…)이라 명세서의 `findStepByLabel` 키워드(과세표준·산출세액 등)와
    // 겹치지 않는다. 겹치는 키워드는 「양도소득금액」뿐이라 그 호출부가 차감 step을 걸러낸다(`DetailedStatementHelpers.ts`).
    steps: mixedUseStepsToCalculationSteps(b.steps),
    mixedUseDetail: b,
  };
}

/**
 * 실제 채택된 **산출세액**(비사업용 가산 제외분).
 *
 * §104⑤2호(자산별 산출세액 합)가 채택되면 `taxByBasicRate`(1호)는 **채택되지 않은 값**이다.
 * 그걸 그대로 표시하면 「산출세액 < 지방소득세×10」 같은 불일치가 난다.
 * 결과 카드·신고서 어댑터가 **같은 식**을 쓰도록 단일 소스로 둔다
 * (memory `feedback_engine_result_display_drift`).
 *
 * `rateBasis` 미주입(구 캐시 결과)이면 종전 동작(1호)으로 fallback.
 */
export function adoptedCalculatedTax(t: MixedUseTotalTax): number {
  return t.rateBasis === "clause2" ? t.transferTax - t.nonBusinessSurcharge : t.taxByBasicRate;
}

/** 양도소득세 기본세율 8구간 (소득세법 §104) — 캐시된 결과 fallback용 */
export function deriveBasicRateBracket(taxBase: number): { rate: number; deduction: number } {
  if (taxBase <= 14_000_000) return { rate: 0.06, deduction: 0 };
  if (taxBase <= 50_000_000) return { rate: 0.15, deduction: 1_260_000 };
  if (taxBase <= 88_000_000) return { rate: 0.24, deduction: 5_760_000 };
  if (taxBase <= 150_000_000) return { rate: 0.35, deduction: 15_440_000 };
  if (taxBase <= 300_000_000) return { rate: 0.38, deduction: 19_940_000 };
  if (taxBase <= 500_000_000) return { rate: 0.40, deduction: 25_940_000 };
  if (taxBase <= 1_000_000_000) return { rate: 0.42, deduction: 35_940_000 };
  return { rate: 0.45, deduction: 65_940_000 };
}

/** 계산 섹션 id — ④ 비사업용토지는 조건부 렌더 */
