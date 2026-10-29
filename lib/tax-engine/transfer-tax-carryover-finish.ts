/**
 * 배우자등 이월과세(§97조의2) — Step 5~7 공통 꼬리(`finishScenarios`).
 *
 * 800줄 정책(≥750 기회주의적 분리)으로 `transfer-tax-carryover.ts`에서 내려보냈다. 로직은 그대로다 —
 * Scenario B 계산 · §97의2②3호 비교 · 반환을 일반 양도·부담부증여 경로가 한 지점에서 쓴다.
 */
import { calculateHoldingPeriod, computeLumpSumDeductionBase } from "./tax-utils";
import { isBurdenedGiftCarryover } from "./transfer-tax-carryover-burdened-gift";
import { buildInputB, ownerSplitPartEcho } from "./transfer-tax-carryover-inputs";
import { burdenedGiftPerAssetTotals, bgRedevFilingAcquisition } from "./burdened-gift-totals";
import { redevFilingTotals } from "./redev-acquisition-inverse";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { CarryoverTaxationDetail, CarryoverScenarioADetail, CarryoverScenarioBDetail } from "./types/transfer-carryover.types";
import type { CalcCarryoverResult } from "./transfer-tax-carryover";

/**
 * Step 5~7 공통 꼬리 — Scenario B 계산 · §97의2②3호 비교 · 반환.
 *
 * 일반 양도 경로와 부담부증여 경로가 **같은 비교·채택 규칙**을 쓰도록 한 지점으로 모았다
 * (D-7a). 두 경로가 다른 것은 시나리오 A를 **어떻게 만들었는가**뿐이다.
 */
export function finishScenarios(args: {
  rawInput: TransferTaxInput;
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>;
  rates: TaxRatesMap;
  calculateTransferTax: (input: TransferTaxInput, rates: TaxRatesMap) => {
    determinedTax: number;
    transferGain: number;
    longTermHoldingDeduction: number;
    longTermHoldingRate: number;
    taxBase: number;
    calculatedTax: number;
    isExempt?: boolean;
    isPartialExempt?: boolean;
    splitDetail?: SplitGainResult;
    /** 부담부증여 §159 안분 명세 — 시나리오 B의 취득가액 echo(부담부증여는 §159①1호 안분값)를 여기서 읽는다. */
    transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
    /** 재개발·재건축(§166) 결과 — 이 경우 §159 명세는 인가 전 분만 담아 B 취득가액 합으로 쓰지 않는다. */
    redevelopmentDetail?: TransferTaxResult["redevelopmentDetail"];
  };
  /** §97의2②3호 비교 결과 강제(다건 신고단위 비교 전용). undefined면 자체 비교. */
  scenarioOverride?: "A" | "B";
  /** 시나리오 A가 §89①3호 각 목의 주택 양도에 해당하는가 — ②2호 판정의 한쪽 항(D-8). */
  scenarioAIsOneHouse: boolean;
  /** 부담부증여 전용 — 증여세 상당액 안분 내역(표시용). 일반 양도는 undefined. */
  giftTaxApportionment?: CarryoverScenarioADetail["giftTaxApportionment"];
  applicablePeriodYears: 5 | 10;
  inputAFinal: TransferTaxInput;
  resultA: { determinedTax: number; transferGain: number; splitDetail?: SplitGainResult; redevelopmentDetail?: TransferTaxResult["redevelopmentDetail"] };
  donorAcqPrice: number;
  /** `donorAcqPrice`가 §166 신고서 역산 값인가 — 카드 라벨 분기 전용. */
  acquisitionIsRedevelopmentFiling?: boolean;
  giftTaxAddedToExpense: number;
  giftTaxLimitApplied: boolean;
  giftTaxLimitCap: number;
  effectiveDonorCapex: number;
  donorCapexGuardApplied: boolean;
  effectiveCapex: number;
  necessaryExpenseIsLumpDeduction: boolean;
  echoStdAtAcq: number | undefined;
  echoStdAtTransfer: number | undefined;
}): CalcCarryoverResult {
  const {
    rawInput, ct, rates, calculateTransferTax, applicablePeriodYears,
    inputAFinal, resultA, donorAcqPrice, echoStdAtAcq, echoStdAtTransfer,
  } = args;
  const determinedTaxA = resultA.determinedTax;

  // Scenario A 보유연수 (§95④ 단서 — 당초 증여자 취득일 기산)
  const holdingA = calculateHoldingPeriod(ct.donorAcquisitionDate, rawInput.transferDate);

  // 재개발(§166) 비부담부증여 — 취득가액 echo는 신고서와 같은 §166 역산(인가 전·후·청산금 분 합)이다. 증여자 취득가액만 싣던 종전 값은 인가 후 분 취득을 빠뜨렸다.
  // 부담부증여는 호출부가 이미 역산 값을 넘긴다(`acquisitionIsRedevelopmentFiling`).
  const detailA = resultA.redevelopmentDetail;
  const redevFilingAcqA =
    !args.acquisitionIsRedevelopmentFiling && detailA ? redevFilingTotals(detailA, rawInput.transferPrice).acquisition : undefined;
  // 증여세 산입 echo — 비부담부증여 재개발은 §166 경로가 인가 전 분 양도차익으로 한도를 적용해 실제 산입한 값(`carryoverGiftTaxApplied`)이 정본이다.
  const redevGiftApplied =
    !isBurdenedGiftCarryover(rawInput) && detailA?.carryoverGiftTaxApplied !== undefined ? detailA.carryoverGiftTaxApplied : undefined;
  const redevGiftCap = redevGiftApplied !== undefined ? detailA?.carryoverGiftTaxCap : undefined;
  const scenarioA: CarryoverScenarioADetail = {
    acquisitionPrice: redevFilingAcqA ?? donorAcqPrice,
    ...(args.acquisitionIsRedevelopmentFiling || redevFilingAcqA !== undefined ? { acquisitionIsRedevelopmentFiling: true } : {}),
    holdingPeriodYears: holdingA.years,
    giftTaxAddedToExpense: redevGiftApplied ?? args.giftTaxAddedToExpense,
    giftTaxLimitApplied: redevGiftCap !== undefined ? args.giftTaxAddedToExpense > redevGiftCap : args.giftTaxLimitApplied,
    giftTaxLimitCap: redevGiftCap ?? args.giftTaxLimitCap,
    giftTaxApportionment: args.giftTaxApportionment,
    donorCapexAddedToExpense: args.effectiveDonorCapex,
    donorCapexGuardApplied: args.donorCapexGuardApplied,
    effectiveCapex: args.effectiveCapex,
    acquisitionWasEstimated: ct.useEstimatedAcquisition,
    // 표시 라벨·산식 base echo — UI의 금액 자기일치 역추론을 대체한다(types 주석 참조).
    necessaryExpenseIsLumpDeduction: args.necessaryExpenseIsLumpDeduction,
    lumpDeductionBase:
      echoStdAtAcq != null
        ? computeLumpSumDeductionBase(echoStdAtAcq, rawInput.ownershipRatio)
        : undefined,
    estimatedStdPriceAtAcquisition: echoStdAtAcq,
    estimatedStdPriceAtTransfer: echoStdAtTransfer,
    transferGain: resultA.transferGain,
    ...ownerSplitPartEcho(rawInput, resultA.splitDetail),
    determinedTax: determinedTaxA,
  };

  // ─────────────────────────────────────────────────────────
  // Step 5: Scenario B — 미적용 시나리오 (비교용)
  // ─────────────────────────────────────────────────────────
  const inputB = buildInputB(rawInput, ct);
  const resultB = calculateTransferTax(inputB, rates);
  const determinedTaxB = resultB.determinedTax;

  const holdingB = calculateHoldingPeriod(ct.giftRegistryDate, rawInput.transferDate);

  // 부담부증여(§159): B의 취득가액은 증여 당시 평가액이 아니라 엔진이 STEP 0.48에서 덮어쓴 §159①1호 안분값(양도인 취득가액 × 채무액 / 증여가액)이다 —
  // 결과의 §159 명세 슬롯이 정본이다(A의 `bgAcqPrice`와 같은 방식). 재개발(§166)은 명세가 인가 전 분만 담아 제외한다.
  // 재개발(§166) 자산은 §159 슬롯이 인가 전 분만 담아 신고서와 같은 §166 역산(`bgRedevFilingAcquisition`)을 쓴다 — 슬롯 합을 쓰지 않는다.
  const redevFilingAcqB = resultB.redevelopmentDetail
    ? (bgRedevFilingAcquisition(resultB) ?? redevFilingTotals(resultB.redevelopmentDetail, rawInput.transferPrice).acquisition)
    : undefined;
  const bgB = resultB.redevelopmentDetail ? undefined : resultB.transferBurdenedGiftBreakdown;
  const scenarioB: CarryoverScenarioBDetail = {
    acquisitionPrice: redevFilingAcqB !== undefined
      ? redevFilingAcqB
      : bgB
      ? burdenedGiftPerAssetTotals(bgB).acquisitionPrice
      : ct.giftDateValuation,
    ...(redevFilingAcqB !== undefined ? { acquisitionIsRedevelopmentFiling: true } : bgB ? { acquisitionIsBurdenedGiftShare: true } : {}),
    holdingPeriodYears: holdingB.years,
    transferGain: resultB.transferGain,
    ...ownerSplitPartEcho(rawInput, resultB.splitDetail),
    longTermHoldingDeduction: resultB.longTermHoldingDeduction,
    longTermHoldingRate: resultB.longTermHoldingRate,
    taxBase: resultB.taxBase,
    calculatedTax: resultB.calculatedTax,
    determinedTax: determinedTaxB,
  };

  /**
   * Step 5.5: **§97의2②2호 자동 판정** (2026-08-10 D-8).
   *
   * > 2. 제1항을 적용할 경우 제89조제1항제3호 각 목의 주택[…**고가주택**(이에 딸린 토지를
   * >    포함한다)을 포함한다]의 양도에 **해당하게 되는 경우**
   *
   * ## 🔑 「해당하게 **되는**」은 **상태 변화**를 요구한다
   *
   * · **사전-2016-법령해석재산-0374**(법령해석과-3693, 2016.11.15.):
   *   「같은 조 제1항 규정을 **적용하지 아니하는 경우에도** … 1세대1주택 고가주택의 양도에
   *     해당하게 되는 경우 **제97조의2제2항제2호를 적용하지 않는 것**이며, 취득가액은 그
   *     배우자의 취득 당시 금액으로 하고, 그 배우자의 보유기간을 통산하는 것입니다.」
   *
   * ⚠️ 종전 주석은 **서면-2022-부동산-0068**도 이 근거로 읽었으나 오독이다(D45 정정). 0068 질의1은
   *    「**증여일 현재** 1세대1주택」을 배우자에게서 받은 경우의 **배우자 예외**다 — 아래 별도 분기.
   *
   * ⇒ **이월과세를 적용하지 않아도 이미 1세대1주택이면 ②2호는 발동하지 않는다**
   *   (= 이월과세를 그대로 **적용**한다). ②2호는 **이월과세를 적용해야 비로소** 1세대1주택이
   *   되는 경우, 즉 **A는 해당하는데 B는 해당하지 않는** 조합에서만 걸린다.
   *
   * ## ⚠️ ②3호보다 **앞**에 둔다
   *
   * ②2호가 걸리면 ①을 적용하지 않으므로 ②3호의 세액 비교는 **하지 않는다**.
   * 그래서 `comparisonExclusion`은 false다(비교로 배제된 것이 아니다).
   *
   * ## 왜 자동 판정이 필요했나 — ②3호가 대신해 주지 못하는 구간이 있다
   *
   * ②3호가 ②2호를 덮어 주는 것은 「A가 비과세로 **싸지기**」 때문이다. **A가 비싼 채로**
   * 비과세에 해당하면(양도인 취득가액이 높아 B의 차익이 작은 경우) ②3호는 걸리지 않는다.
   */
  const becomesOneHouseOnlyWithCarryover =
    args.scenarioAIsOneHouse &&
    !(resultB.isExempt === true || resultB.isPartialExempt === true);
  /**
   * ## 배우자 예외 (D45) — ②2호의 「해당하게 되는 경우」 밖에 있는 또 하나의 조합
   *
   * 서면-2022-부동산-0068(부동산납세과-3383 · 기재부 재산세제과-333 인용) 질의1 ·
   * 서면-2016-법령해석재산-3313 · 서면-2016-부동산-4434 · 서면-2016-부동산-3753:
   * 「**증여일 현재** §89①3호에 따른 1세대1주택에 해당하는 주택을 **배우자**로부터 증여받아
   *  (이혼 후) 양도하는 경우 §97의2②2호를 적용하지 않는 것」.
   * ⇒ B가 1세대1주택 비과세에 **해당하지 않아도**(위 조합) 배우자 증여 + 증여일 현재 1세대1주택이면
   *   ②2호를 적용하지 않는다. 판정 기준일이 **증여일**이라 엔진이 가진 사실(양도일 기준)로는
   *   도출할 수 없다 — 사실 입력(`spouseGiftOneHouseAtGiftDate`)으로 받는다.
   * ⚠️ ②2호는 걸릴수록 세액이 내려가기만 하므로(②3호가 max를 대신하므로) 이 예외는 **세액을 올린다**.
   */
  const spouseException =
    ct.donorRelation === "spouse" && ct.spouseGiftOneHouseAtGiftDate === true;
  /**
   * F-13 Q-4 — 주택부수토지 카드는 짝 주택의 ②2호 결과를 따른다. ②2호의 「주택」은 「고가주택(이에 딸린
   * 토지를 포함한다)」이고 §89①3호의 비과세 객체는 주택과 주택부수토지다 — 주택이 이월과세로 비로소
   * 1세대1주택이 되면 그 부수토지도 같다(2026-09-19 사용자 결정). 이 카드 자신의 A/B 비과세는 주택 판정을
   * 그대로 받으므로 위 조합만으로는 발동하지 않는다.
   */
  const followsHouseExclusion =
    rawInput.oneHouseUnitRole === "appurtenant_land" &&
    rawInput.appurtenantHouseVerdict?.carryoverOneHouseExcluded === true;
  const oneHouseExclusion =
    (becomesOneHouseOnlyWithCarryover && !spouseException) || followsHouseExclusion;
  const spouseOneHouseExceptionApplied = becomesOneHouseOnlyWithCarryover && spouseException;

  if (oneHouseExclusion) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: "one_house_exemption",
        oneHouseExclusionSource: "auto",
        scenarioA,
        scenarioB,
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: inputB,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 6: 비교과세 (§97조의2 ② 3호)
  // ─────────────────────────────────────────────────────────
  /**
   * 🔑 **비교 단위는 「양도소득 결정세액」(§92③2호)이다 — 신고단위 개념이다.**
   *
   * 자산이 1건이면 이 함수가 비교하는 단건 결정세액이 곧 신고 전체의 결정세액이라 그대로 옳다.
   * **자산이 여러 건이면 그렇지 않다** — A/B 전환은 그 자산의 **세율군까지 바꾸므로**
   * (A=증여자 취득일 기산 / B=증여 등기접수일 기산) 다른 자산과의 §104⑤ 누진 합산·§102② 통산이
   * 함께 움직이는데, 단건 비교는 그 효과를 **구조적으로 볼 수 없다**.
   * 실측: 300 격자 중 7건이 뒤집혔고 **전부 현행 과소**였다(750,000~20,900,000).
   *
   * 그래서 다건 엔진은 집계를 A/B 두 번 돌려 비교한 결과를 `scenarioOverride`로 내려보낸다
   * (`transfer-tax-aggregate-carryover-scope.ts`). 여기서는 **그 값을 그대로 따른다**.
   *
   * 동률(A === B)이면 A 채택 — 단서 조건이 「**적은** 경우」라 동률은 적용 유지다.
   */
  const adoptedScenario: "A" | "B" =
    args.scenarioOverride ?? (determinedTaxA >= determinedTaxB ? "A" : "B");
  const comparisonExclusion = adoptedScenario === "B";

  // ─────────────────────────────────────────────────────────
  // Step 7: 반환
  // ─────────────────────────────────────────────────────────
  const detail: CarryoverTaxationDetail = {
    isEligible: true,
    applicablePeriodYears,
    exclusionReason: comparisonExclusion ? "tax_comparison" : undefined,
    scenarioA,
    scenarioB,
    adoptedScenario,
    comparisonExclusion,
    ...(spouseOneHouseExceptionApplied ? { spouseOneHouseExceptionApplied: true } : {}),
  };

  return {
    detail,
    adoptedInput: adoptedScenario === "A" ? inputAFinal : inputB,
  };
}
