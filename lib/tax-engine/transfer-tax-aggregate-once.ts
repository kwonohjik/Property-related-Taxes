/**
 * 양도소득세 다건 집계 — **이월과세 시나리오 배정 1개**에 대한 신고 전체 계산 1회.
 *
 * 공개 진입점(`transfer-tax-aggregate.ts`의 `calculateTransferTaxAggregate`)이 §97의2②3호를
 * 신고단위 결정세액으로 판정하려고 이 함수를 배정마다 부른다. 800줄 정책으로 진입점과 나눴다
 * (계획서 `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §4.2 PR-0).
 *
 * 순수 함수. DB 직접 호출 없음.
 */

import { buildBundleBurdenedGiftWhole } from "./transfer-tax-aggregate-burdened-gift";
import { withCardAcquisitions } from "./transfer-tax-aggregate-burdened-gift";
import {
  parseRatesFromMap,
  type CalculationStep,
} from "./transfer-tax";
import { computeAmendment } from "./transfer-tax-amendment";
import { resolveUnpaidTax } from "./transfer-tax-unpaid-tax";
import {
  calculateTransferTaxPenalty,
  formatDelayedPaymentFormula,
  formatFilingPenaltyFormula,
} from "./transfer-tax-penalty";
import {
  aggregateReductions,
  allocateAggregateReductions,
  allocationWeightOf,
  choose104_5AfterReduction,
  computeAggregateTaxCreditRuralSurtax,
} from "./transfer-tax-aggregate-reduction-step";
import type { CarryoverScenarioOverrides } from "./transfer-tax-aggregate-carryover-scope";
import { buildAssetRecords } from "./transfer-tax-aggregate-asset-records";
import {
  expandSplitBasicUnits,
  foldBasicUnitAllocation,
  unitAssetOf,
  unitIdOf,
  type BasicDeductionUnits,
} from "./transfer-tax-aggregate-basic-units";
import { resolveDisplayAcquisitionAndExpense, resolveLthdPartsEcho } from "./transfer-tax-aggregate-display-echo";
import { computeSettlement } from "./transfer-tax-settlement";
import { TRANSFER } from "./legal-codes";
import { applyRate } from "./tax-utils";
import {
  validateInput,
  offsetLosses,
  allocateBasicDeduction,
  allocateBasicDeductionAcrossParts,
  sameDayTieGroups,
  sameDayReducibleRateGroups,
  pickFavorableTieRank,
  sameDayReducibleRatesDiffer,
  type TieCandidate,
} from "./transfer-tax-aggregate-helpers";
// picker 6종 + 세율군 1-pass 집계 — 800줄 정책 분리(Phase A-0)
import {
  pickValuationDetails,
  pickReductionDetails,
  incomeDeductionReducibleOf,
  ruralSurtaxExemptReducibleOf,
  computeGroupsAndComparison,
} from "./transfer-tax-aggregate-pickers";
import { reducibleIncomeOf, bucketsOfRecord, reducibleIncomeOfRecord } from "./transfer-tax-aggregate-reduction-step";
import { netLossOnReducibleUnit, reducibleAfterLossOf, reducibleShiftOf } from "./transfer-tax-aggregate-reducible-loss-share";

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RatesByTransferDate } from "./transfer-tax-item-rates";
// transfer-tax-penalty 직접 호출 없음 — 자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행.

import type {
  AggregateTransferInput,
  PerPropertyBreakdown,
  AggregateTransferResult,
} from "./types/transfer-aggregate.types";

/**
 * 기본공제 배분 전략 → 화면 라벨.
 * 산식 문자열에 내부 enum 값(`MAX_BENEFIT` …)이 그대로 나가던 것을 막는다
 * (memory `feedback_no_internal_id_in_result`). 표시 전용 — 세액 불변.
 */
const BASIC_DEDUCTION_ALLOCATION_LABEL: Record<
  "FIRST" | "EARLIEST_TRANSFER" | "PARTS_HIGHEST_RATE",
  string
> = {
  FIRST: "첫 번째 자산",
  EARLIEST_TRANSFER: "감면 외 소득 → 양도일이 빠른 자산 (소득세법 §103②)",
  PARTS_HIGHEST_RATE: "세율이 높은 파트",
};

/**
 * 집계 1회 계산 — **주어진 이월과세 시나리오 assignment 하에서** 신고 전체를 계산한다.
 *
 * 공개 진입점은 `transfer-tax-aggregate.ts`의 `calculateTransferTaxAggregate`다. 그쪽이 §97의2②3호를
 * **신고단위 결정세액**으로 판정하기 위해 이 함수를 여러 번 부른다.
 */
export function computeAggregateOnce(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
  carryoverOverrides: CarryoverScenarioOverrides,
  ratesByTransferDate: RatesByTransferDate | undefined,
): AggregateTransferResult {
  const warnings: string[] = [];
  const steps: CalculationStep[] = [];

  // M-0: 검증
  validateInput(input);

  // M-0.5: 축 B·함께 양도 × 부담부증여 — 물건 전체 §159 1회(표시 전용). 근거·의제취득일 전 카드 처리는 분리 파일 주석.
  const burdenedGiftWhole = buildBundleBurdenedGiftWhole(input);

  // 800줄 분리 — M-1(건별 단건 엔진 호출)+M-2(세율군 분류)는
  //   `transfer-tax-aggregate-asset-records.ts` 로 이동했다. in 1 · out 1 이라 하류 참조가
  //   하나도 바뀌지 않는다([[feedback_800line_split_playbook]] 「거대 단일 함수는 구조분해」).
  const assetRecords = buildAssetRecords(input, rates, carryoverOverrides, warnings, ratesByTransferDate);


  // M-3: §102② 차손 통산
  const {
    lossOffsetTable,
    lossOffsetFromSame,
    lossOffsetFromOther,
    incomeAfterOffset,
    partIncomeAfterOffset,
    unusedLoss,
  } = offsetLosses(assetRecords, input.crossLossOffsetExternal);
  // 파트 단위로 통산한 split 자산은 파트별 통산 후 소득을 세액 단계의 파트 안분 가중치로 넘긴다(Q-F3a).
  partIncomeAfterOffset.forEach((w, i) => {
    if (w) assetRecords[i].lossPartIncomeAfterOffset = w;
  });
  // 영 §167의2② — 세액감면형(§90①)의 B도 받은 차손 중 감면소득 몫만큼 줄인다. 이하 단계는 전부 이 B′를 읽는다.
  reducibleAfterLossOf(assetRecords, { incomeAfterOffset, partIncomeAfterOffset }).forEach((v, i) => {
    assetRecords[i].reducibleAfterLoss = v;
  });

  // income-deduction 감면(§99의3·§99·§98의8·하이브리드 5년후) — 세액 계산용 "감면후 income" 분리.
  // incomeAfterOffset(pre-감면)는 양도소득금액 표시·차손통산·농특세 감면前 기준으로 보존.
  //
  // 시행령 §167의2② — 자산이 통산받은 양도차손은 순양도소득금액:감면소득금액 비율로 안분하고,
  // 감면소득금액을 감면분 차손만큼 축소한 값을 법 §90 감면소득금액으로 본다. (차손 미수령이면 축소 0.)
  const incomeDeductionReducible = assetRecords.map((r, i) => {
    const reducible = incomeDeductionReducibleOf(r.result);
    if (reducible <= 0) return 0;
    // 분모는 통산 前 양도소득금액(감면소득금액 포함). 감면분 흡수 차손은 절사(순분이 잔여 흡수) — 세액감면형과 같은 leaf.
    //   차손은 다건 순차손(받은 차손 − 다른 자산에 넘긴 파트 차손)이다 — 세액감면형 B′와 같은 단위(`netLossOnReducibleUnit`).
    return reducible - reducibleShiftOf(netLossOnReducibleUnit(r, incomeAfterOffset[i], partIncomeAfterOffset[i]), reducible);
  });
  const taxableAfterReduction = incomeAfterOffset.map((v, i) =>
    Math.max(0, v - incomeDeductionReducible[i]),
  );
  const hasIncomeDeduction = incomeDeductionReducible.some((v) => v > 0);

  steps.push({
    label: "양도차손 통산 (§102② · 시행령 §167의2)",
    formula: `그룹 내 통산 + 타군 pro-rata 안분 (잔여 차손 ${unusedLoss.toLocaleString()} 소멸, 이월 불인정)`,
    amount: lossOffsetTable.reduce((s, r) => s + r.amount, 0),
    legalBasis: TRANSFER.LOSS_OFFSET,
  });

  // M-4: 기본공제 배분 (미등기·exempt 제외)
  const parsedRates = parseRatesFromMap(rates);
  const annualLimit = parsedRates.basicDeductionRules.annualLimit;
  const availableThisCalc = Math.max(0, annualLimit - input.annualBasicDeductionUsed);

  const eligibleForBasic = assetRecords
    .map((r, idx) => ({
      idx,
      rateGroup: r.rateGroup,
      income: taxableAfterReduction[idx],
      isExempt: r.result.isExempt,
      transferDate: r.item.transferDate,
      /**
       * §90①의 **B — 감면대상 양도소득금액**(세액감면형). §103② 1단계가 이 부분을
       * **뒤로 미룬다**(감면 외에서 먼저 공제). 감면액 산식 쪽과 **같은 leaf**를 쓴다 —
       * 두 곳이 B를 따로 유도하면 표시와 세액이 갈린다.
       * 소득공제형(§90②)은 이미 `taxableAfterReduction`에서 빠져 있다.
       */
      reducibleIncome: reducibleIncomeOf(r),
      /** 감면율별 조각 — 같은 날 감면소득은 감면율 낮은 것부터(부동산거래관리과-0893). 감면액 산식과 같은 leaf. */
      reducibleBuckets: bucketsOfRecord(r),
      /** 한계세율 — `PARTS_HIGHEST_RATE` 축과 §103② 동순위 기본 순서(`tieRank` 없을 때)에 쓴다. */
      rate: r.result.appliedRate,
    }))
    .filter((r) => !r.isExempt && r.rateGroup !== "unregistered" && r.income > 0);

  /**
   * 배분 축은 **둘**이고 함수도 둘이다 — 한 함수가 겸용하면 다건 기본값이 법정 순서가 아닌 채로
   * 굳는다(2026-09-16 실측: 「높은 세율 우선」이 `rateGroup` 우선순위로 정렬해 40% 자산이
   * 72% 자산보다 앞섰다 — 880,000원 과대).
   *   · 자산 간 → §103② 법정 순서 (기본값)
   *   · 한 물건의 파트 간 → 한계세율 (일반건물 카드 — 양도일이 같아 §103②가 성립하지 않는다)
   */
  const allocationAxis = input.basicDeductionAllocation ?? "EARLIEST_TRANSFER";
  /**
   * §103② 배분 행 — split 자산은 파트로 펼친다(F-B, `transfer-tax-aggregate-basic-units.ts`). 법정 순서 축에서만이다 —
   * 입력 순서(`FIRST`)·일반건물 카드 파트 축·일괄양도(`sameDayEqualTaxOrder`)는 자산 한 행 그대로.
   */
  const units: BasicDeductionUnits =
    allocationAxis === "EARLIEST_TRANSFER" && input.sameDayEqualTaxOrder === undefined
      ? expandSplitBasicUnits(assetRecords, eligibleForBasic)
      : { eligible: eligibleForBasic, partOf: new Map() };
  /**
   * §103②이 침묵하는 **같은 날 양도** 묶음 — 재일46014-1685 「납세자에게 유리하다고 판단되는 양도자산의
   * 양도소득금액에서부터」. 무엇이 유리한지는 신고 전체 세액으로만 판정되므로 아래 `finishWith`를 후보 순서마다
   * 돌려 고른다(계획서 `transfer-basic-deduction-same-day-tie.plan.md` D-1).
   */
  const tieGroups =
    allocationAxis === "EARLIEST_TRANSFER" ? sameDayTieGroups(units.eligible, availableThisCalc) : [];
  /**
   * 같은 날 감면율이 다른 감면소득 — 0893 순서(감면율 낮은 것부터)가 조특법 §133 한도 때문에 불리할 수 있어
   * 자산 블록 순서를 0893 뒤의 후보로 함께 평가한다(계획서 `transfer-basic-deduction-133-cap-order.plan.md`).
   */
  const reducibleGroups =
    allocationAxis === "EARLIEST_TRANSFER" ? sameDayReducibleRateGroups(units.eligible, availableThisCalc) : [];

  /** M-4 배분부터 끝까지 — 동순위 순서(`TieCandidate`)만 바꿔 다시 돌릴 수 있게 감싼다. `steps`·`warnings`는 호출마다 사본이다. */
  const finishWith = (
    { tieRank, reducibleRank }: TieCandidate,
    steps: CalculationStep[],
    warnings: string[],
  ): AggregateTransferResult => {
  const allocation =
    allocationAxis === "PARTS_HIGHEST_RATE"
      ? allocateBasicDeductionAcrossParts(eligibleForBasic, availableThisCalc)
      : allocateBasicDeduction(units.eligible, availableThisCalc, allocationAxis, tieRank, reducibleRank);
  const { allocatedBasic, partBasic } = foldBasicUnitAllocation(assetRecords, units, allocation);
  const totalBasicDeduction = allocatedBasic.reduce((s, v) => s + v, 0);
  /**
   * §90①의 C를 읽는 배분 — §103② 순서(감면 외 먼저 → 같은 날 감면소득은 감면율 낮은 것부터)여야 한다.
   * 파트 축(`PARTS_HIGHEST_RATE` — 일반건물 카드)은 세율 높은 파트부터 배분해 1단계를 따르지 않으므로
   * 감면 계산용으로 §103② 배분을 따로 구한다(종전에도 C는 「총 기본공제 − 비감면소득」으로 1단계를 지켰다 —
   * GBRT-03 §17 매수청구 39,819,766). 파트 축의 표시 배분 자체는 이번 범위 밖이다.
   */
  const allocatedBasicForReduction =
    allocationAxis === "PARTS_HIGHEST_RATE"
      ? (() => {
          const byIdx: number[] = assetRecords.map(() => 0);
          for (const a of allocateBasicDeduction(eligibleForBasic, availableThisCalc, "EARLIEST_TRANSFER", tieRank, reducibleRank)) byIdx[a.idx] = a.amount;
          return byIdx;
        })()
      : allocatedBasic;

  /** 같은 날 양도 처리 근거 — 동순위 묶음에 공제가 닿았을 때만(침묵 금지 · 없으면 종전 문구). */
  const basicDeductionTieNote = [
    tieGroups.length > 0 ? " · 같은 날 양도 — 납세자에게 유리한 순서(재일46014-1685)" : "",
    reducibleRank
      ? " · 같은 날 감면소득 — 조특법 §133 감면 한도를 반영해 납세자에게 유리한 순서(재일46014-1685)"
      : sameDayReducibleRatesDiffer(units.eligible, allocation, allocationAxis === "FIRST") ?" · 같은 날 감면소득 — 감면율 낮은 소득부터(부동산거래관리과-0893)" : "",
  ].join("");
  steps.push({
    label: "기본공제",
    formula: `연 한도 ${annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()} = ${totalBasicDeduction.toLocaleString()} (${BASIC_DEDUCTION_ALLOCATION_LABEL[allocationAxis]} 배분)${basicDeductionTieNote}`,
    amount: totalBasicDeduction,
    legalBasis: TRANSFER.BASIC_DEDUCTION,
  });

  // 표시·결과용 총 양도소득금액(감면前, Σ incomeAfterOffset).
  const totalIncomeAfterOffset = incomeAfterOffset.reduce((s, v) => s + v, 0);

  // M-5·M-6·M-7: 세율군별 집계 + 전체누진 + 비교과세(§104⑤) — 감면후 income(taxableAfterReduction) 기준.
  const {
    groupTaxes,
    calculatedTaxByGroups,
    calculatedTaxByGeneral,
    calculatedTax: calculatedTaxBeforeReduction,
    comparedTaxApplied: comparedBeforeReduction,
    assetPartTax,
    clause8TaxBase,
    clause8Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
    clauseTaxes,
    assetClauseKeys,
    assetPartClauseKeys,
    assetPartBasic,
    assetPartIncome,
  } = computeGroupsAndComparison(assetRecords, taxableAfterReduction, allocatedBasic, rates, partBasic);

  // §104⑤ 괄호 — 호별 감면(F-9)이 두 경로에서 달라지면 **감면 차감 후** 세액으로 고른다.
  const m8Base = {
    assetRecords,
    taxableAfterReduction,
    totalBasicDeduction,
    allocatedBasic: allocatedBasicForReduction,
    assetPartBasic,
    taxYear: input.taxYear,
    priorReductionUsage: input.priorReductionUsage ?? [],
  };
  const { calculatedTax, comparedTaxApplied, perClause, decidedAfterReduction } =
    choose104_5AfterReduction({
      base: m8Base,
      calculatedTaxByGroups,
      calculatedTaxByGeneral,
      calculatedTax: calculatedTaxBeforeReduction,
      comparedTaxApplied: comparedBeforeReduction,
      perClause: { clauseTaxes, assetClauseKeys, assetPartClauseKeys, assetPartBasic, assetPartIncome, allocatedBasic },
    });

  steps.push({
    label: "비교과세 (§104⑤)",
    formula: `세율군별 ${calculatedTaxByGroups.toLocaleString()} vs 전체누진 ${calculatedTaxByGeneral.toLocaleString()} → ${comparedTaxApplied === "none" ? "비교 불필요 (중과·단기 없음)" : decidedAfterReduction ? `감면세액 차감 후 큰 쪽 = ${calculatedTax.toLocaleString()} (${comparedTaxApplied === "groups" ? "세율군별" : "전체누진"})` : `MAX = ${calculatedTax.toLocaleString()} (${comparedTaxApplied === "groups" ? "세율군별" : "전체누진"})`}`,
    amount: calculatedTax,
    legalBasis: TRANSFER.COMPARATIVE_TAXATION,
  });

  // 농어촌특별세 (§99의3 등 소득금액차감 감면세액 × 20%, 농특세법 §3·§5) — 집계 2-pass.
  // 감면 前 산출세액 = 비과세분(§98의3·§98의5 ruralSurtaxExempt)만 그대로 둔 income으로 재산출.
  let ruralSurtax = 0;
  if (hasIncomeDeduction) {
    // 비과세(§98의3·§98의5) 감면분은 baseline에 그대로 둔다(농특세 미발생). §167의2② 축소 후 값(=조정 감면소득금액) 사용.
    const surtaxBaseline = incomeAfterOffset.map((v, i) => {
      const isExemptAsset = ruralSurtaxExemptReducibleOf(assetRecords[i].result) > 0;
      return Math.max(0, v - (isExemptAsset ? incomeDeductionReducible[i] : 0));
    });
    const beforeTax = computeGroupsAndComparison(assetRecords, surtaxBaseline, allocatedBasic, rates, partBasic).calculatedTax;
    ruralSurtax = applyRate(Math.max(0, beforeTax - calculatedTax), 0.2);
    if (ruralSurtax > 0) {
      steps.push({
        label: "농어촌특별세 (감면세액 × 20%)",
        formula: `(감면 전 산출세액 ${beforeTax.toLocaleString()} − 감면 후 산출세액 ${calculatedTax.toLocaleString()}) × 20% = ${ruralSurtax.toLocaleString()}`,
        amount: ruralSurtax,
        legalBasis: TRANSFER.RURAL_SURTAX_993,
      });
    }
  }

  // M-8: 감면 합산 — 유형별 비율 재계산 + 조특법 §133 한도. 상세는 reduction-step ① 참조.
  // F-9 · Q-2 — 「전체 누진」이 채택되면 산출세액이 한 덩어리라 호별로 나눌 A가 없다(합산 유지).
  const { reductionBreakdown, reductionAmount } = aggregateReductions({
    ...m8Base,
    calculatedTax,
    perClause,
    steps,
    warnings,
  });

  const determinedTaxBeforePenalty = Math.max(0, calculatedTax - reductionAmount);

  // M-8.5: 신고서 단위 수정신고·경정청구 정정 (국세기본법 §45·§45의2).
  // 집계 결정세액을 당초 결정세액과 비교 → 추가납부/환급. 단건 finalize STEP 12.5와 동형.
  // correctionKind ?? "amend" 내부 분기(refund면 computeRefundClaim 자동 호출).
  const amendmentDetail = input.amendment
    ? computeAmendment(input.amendment, determinedTaxBeforePenalty)
    : undefined;

  // M-9: 가산세 — 자산별 §114의2 + 자산별 신고불성실/납부지연 합산
  const perAssetBuildingPenalty = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.penaltyTax ?? 0),
    0,
  );
  const perAssetFilingDelayedPenalty = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.penaltyDetail?.totalPenalty ?? 0),
    0,
  );
  /**
   * M-9b: **신고서 단위** 신고불성실·납부지연 가산세 (F17).
   *
   * 일반건물처럼 **자산 1건이 내부 카드 여러 장으로 쪼개지는 경로**를 위한 것이다.
   * 카드마다 실으면 같은 신고 1건의 가산세가 카드 수만큼 배가되므로, 신고 단위로 1회 계산한다.
   *
   * 🔑 base는 **집계 결정세액**을 주입한다 — 단건 route가 2-pass로 하던 일
   * (`route.ts:460` 「먼저 가산세 없이 계산하여 결정세액 확보 후 주입」)을 여기서는
   * 이미 그 값을 알고 있으므로 1-pass로 끝낸다. 호출부가 보낸 `determinedTax`는 화면에서
   * 계산되기 전 값이라 신뢰하지 않는다.
   *
   * ⚠️ 자산별 입력과 **동시에 들어오면 둘 다 부과된다** — 타입 주석이 상호배타를 명시하고,
   *    실제로 그런 payload를 만드는 경로는 없다(일반건물은 신고단위, 다건은 자산별).
   */
  const filingUnitPenaltyDetail =
    input.filingPenaltyDetails || input.delayedPaymentDetails
      ? calculateTransferTaxPenalty({
          filing: input.filingPenaltyDetails
            ? {
                ...input.filingPenaltyDetails,
                determinedTax: determinedTaxBeforePenalty,
                reductionAmount,
              }
            : undefined,
          delayedPayment: input.delayedPaymentDetails
            ? {
                ...input.delayedPaymentDetails,
                // 자동·부재+0 = 결정세액 전액 미납 · 직접 입력은 그대로(0=완납) — 단건 route와 같은 leaf(PEN-C).
                unpaidTax: resolveUnpaidTax(input.delayedPaymentDetails, determinedTaxBeforePenalty),
              }
            : undefined,
        })
      : undefined;

  const penaltyTax =
    perAssetBuildingPenalty +
    perAssetFilingDelayedPenalty +
    (filingUnitPenaltyDetail?.totalPenalty ?? 0);

  // M-10: 지방소득세 (원 미만 절사 — 지방세법 §103② 과세표준 × §103의3 세율 − §103의4 감면)
  // §114조의2 건물 가산세만 더한다 (단건 엔진 finalize와 동일) — 그 근거는 §103의3이 아니라
  // §103의9②(감정·환산취득가액의 1천분의 5를 결정세액에 더한다)이고 값이 같다.
  // 신고불성실·납부지연 가산세(국세기본법 §47의2~5)는 §103의2 3호 열거에 없어 대상이 아니다.
  const localIncomeTax = applyRate(determinedTaxBeforePenalty + perAssetBuildingPenalty, 0.1);
  // 감면 배분 — floor 잔액 말단 흡수(Σ = 전체 불변식). 상세는 reduction-step ② 참조.
  const reductionAllocations = allocateAggregateReductions(assetRecords, reductionBreakdown);

  /**
   * 세액감면형 감면의 **농어촌특별세** — 단건 경로(STEP 8.8)와 **같은 판정표**를 쓴다.
   * 위 `ruralSurtax`는 소득금액 차감형(§99의3 등) 전용이라 §77 계열에는 한 원도 붙지 않았다.
   * 판정·근거는 `transfer-tax-aggregate-reduction-step.ts` ③ 참조.
   */
  const ruralSurtaxCredit = computeAggregateTaxCreditRuralSurtax(
    assetRecords,
    reductionAllocations,
    steps,
  );

  // 신고서 단위 가산세 — 세액에 이미 들어가 있으므로 **근거를 화면에 남긴다**(침묵 금지).
  if (filingUnitPenaltyDetail && filingUnitPenaltyDetail.totalPenalty > 0) {
    const fp = filingUnitPenaltyDetail.filingPenalty;
    const dp = filingUnitPenaltyDetail.delayedPaymentPenalty;
    steps.push({
      label: "가산세 (신고서 단위)",
      formula: [
        // 가목·나목 혼합·이자율 구간 분할을 산식에 반영한다 — 단일 세율/이자율 표기는 금액을 재현하지 못한다.
        fp && fp.filingPenalty > 0
          ? `신고불성실 ${formatFilingPenaltyFormula(fp, "")}`
          : null,
        dp && dp.delayedPaymentPenalty > 0
          ? `납부지연 ${formatDelayedPaymentFormula(dp, "")}`
          : null,
      ]
        .filter(Boolean)
        .join(" + "),
      amount: filingUnitPenaltyDetail.totalPenalty,
      legalBasis: "국세기본법 §47의2·§47의3·§47의4",
    });
  }

  // 농특세는 지방소득세 base 아님(결정세액+건물가산세만) — totalTax에만 가산.
  const ruralSurtaxAll = ruralSurtax + ruralSurtaxCredit;
  const totalTax = determinedTaxBeforePenalty + penaltyTax + localIncomeTax + ruralSurtaxAll;

  steps.push({
    label: "총 납부세액",
    formula: `결정세액 ${determinedTaxBeforePenalty.toLocaleString()} + 가산세 ${penaltyTax.toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}${ruralSurtaxAll > 0 ? ` + 농특세 ${ruralSurtaxAll.toLocaleString()}` : ""}`,
    amount: totalTax,
  });

  // M-11: 예정신고 기납부세액 정산 (소득세법 §111③) — 항상 실행(P??0).
  // amendment 와 상호배타는 validate/UI 가드이며 엔진은 방어적으로 항상 처리한다.
  const settlement = computeSettlement({
    determinedTax: determinedTaxBeforePenalty,
    penaltyTax,
    localIncomeTax,
    priorPaidTax: input.priorPaidTax ?? 0,
    priorPaidLocalTax: input.priorPaidLocalTax ?? 0,
  });
  if (settlement.priorPaidTax > 0 || settlement.priorPaidLocalTax > 0) {
    steps.push(settlement.step);
  }


  // properties breakdown 조립 — 합산 재계산 후 건별 배분액 포함
  const properties: PerPropertyBreakdown[] = assetRecords.map((r, idx) => {
    const reductionType = r.result.reductionTypeApplied;
    /** 표시·배분은 영 §167의2② 반영 후(Q-3), 재계산 경로 판정은 통산 전(C-1 — B′ = 0이어도 단건 감면액으로 돌아가지 않는다). */
    const reducibleIncome = reducibleIncomeOfRecord(r);
    const grossReducible = r.result.isExempt ? 0 : r.result.reducibleIncome ?? 0;
    const standalone = r.result.isExempt ? 0 : r.result.reductionAmount ?? 0;

    // 유형별 재계산 엔트리가 있으면 비율 배분, 없으면 단독값 그대로
    let reductionAggregated = standalone;
    let reductionAllocationRatio = 0;
    if (reductionType && grossReducible > 0) {
      const entry = reductionBreakdown.find((b) => b.type === reductionType);
      if (entry) {
        const w = allocationWeightOf(entry, assetRecords)(idx);
        reductionAllocationRatio = w.total > 0 ? w.own / w.total : 0;
        // 배분액은 위 선계산(말단 잔액 흡수)에서 가져온다 — 여기서 재-floor하면 드리프트가 되살아난다.
        reductionAggregated = reductionAllocations.get(idx) ?? 0;
      }
    }

    // 취득가액·필요경비 echo — 800줄 정책 분리. 분리 취득(split) 정정 사유는 leaf 주석(E-U1).
    const {
      transferPrice: effectiveTransferPrice,
      acquisitionPrice: effectiveAcquisitionPrice,
      necessaryExpense: effectiveNecessaryExpense,
    } = resolveDisplayAcquisitionAndExpense(r);
    // 다건 컨텍스트 자산별 산출세액·결정세액 (참고).
    // 단건 엔진은 skipBasicDeduction=true로 호출되어 r.result.determinedTax는 양도소득금액 기준 부정확.
    // taxBaseShare(= incomeAfterOffset - allocatedBasic) 기준으로 다건 컨텍스트에서 재계산해 노출한다.
    const taxBaseShare = Math.max(0, taxableAfterReduction[idx] - allocatedBasic[idx]);
    /**
     * 🔴 `appliedRate`는 **이미 중과 포함 실효세율**이다 — `surchargeRate`를 더하면 이중 계상이다.
     *    `transfer-tax-rate-calc.ts:410` `appliedRate: roundRate(baseRate + additionalRate * ratio)`
     *    (다주택 경로 :566도 `baseRate + additionalRate`). `surchargeRate`는 별도 echo다.
     *    2026-09-02 코드리뷰 — 참고값 `refCalculatedTax`와 상세명세서 산식이 과대 표시됐다.
     */
    const effectiveRate = r.result.appliedRate;
    // 파트가 있는 자산(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)은 **자산 단독 세액**을
    // 그대로 쓴다. 아래 근사식은 `appliedRate`가 그 자산에서 **파트 최고세율**이라
    // 자산 과세표준 전체에 곱해지면 과대해진다(계획서 §4.12 — 실측 +87,140,000).
    // ⚠️ 파트가 없는 자산은 **종전 산식 그대로** — `calcTax`와 floor 위치가 달라 ±1원이
    //    어긋날 수 있어 건드리지 않는다(Surgical).
    const partAssetTax = assetPartTax[idx];
    const refCalculatedTax = r.result.isExempt
      ? 0
      : (partAssetTax?.tax ??
        Math.max(0, Math.floor(taxBaseShare * effectiveRate) - r.result.progressiveDeduction));
    const refDeterminedTax = Math.max(0, refCalculatedTax - standalone);

    return {
      propertyId: r.item.propertyId,
      propertyLabel: r.item.propertyLabel,
      isExempt: r.result.isExempt,
      isPartialExempt: r.result.isPartialExempt, // [echo] §91② 범위 밖 고지 술어용 (표시 전용)
      exemptReason: r.result.exemptReason,
      transferPrice: effectiveTransferPrice,
      acquisitionPrice: effectiveAcquisitionPrice,
      necessaryExpense: effectiveNecessaryExpense,
      // 신고서 양식: 실가 모드는 자본적지출이 필요경비 칸에 머문다(예외 swap·이월과세 A는 표시 leaf `capExInAcquisitionColumn`)
      // 🔴 필요경비를 넘지 못한다 — 이월과세 A(환산 donor)는 본인 자본적지출 몫이 입력에 실려도 단서가 불발이면(본문 = 개산공제) 필요경비에 들어가지 않는다.
      //    그 값을 그대로 취득가액 칸으로 옮기면 「취득가액 + 필요경비 ≠ 양도가액 − 양도차익」이 된다(일반건물 카드가 본인 몫을 싣기 시작하며 드러났다 — 계획서 V-4).
      capitalExpenditureForDisplay: Math.min(r.singleInput.capitalExpenditure ?? 0, effectiveNecessaryExpense),
      depreciationAmount: r.result.depreciationAmount,
      determinedTax: r.result.determinedTax,
      transferGain: r.result.transferGain,
      exemptGrossGain: r.result.exemptGrossGain, // [echo] 비과세 gross (표시 전용). transferGain·:444 불변.
      longTermHoldingDeduction: r.lthd,
      income: r.income,
      rateGroup: r.rateGroup,
      // §102② 세율축 — `AssetRecord`가 이미 들고 있다(`-asset-records.ts:227`). 재유도 금지.
      lossOffsetRateKey: r.lossOffsetRateKey,
      ...(r.lossParts ? { lossOffsetParts: r.lossParts } : {}),
      lossOffsetFromSameGroup: lossOffsetFromSame[idx],
      lossOffsetFromOtherGroup: lossOffsetFromOther[idx],
      incomeAfterOffset: incomeAfterOffset[idx],
      incomeDeductionReducible: incomeDeductionReducible[idx],
      allocatedBasicDeduction: allocatedBasic[idx],
      taxBaseShare,
      appliedRate: r.result.appliedRate,
      // 신고서 ③ 세율구분 코드의 단일 소스 — 자산 열도 엔진이 정한 호를 그대로 쓴다.
      rateClause: r.result.rateClause,
      nblSurchargeExcluded: r.result.nblSurchargeExcluded,
      nblSurchargeExcludedBy: r.result.nblSurchargeExcludedBy,
      progressiveDeduction: r.result.progressiveDeduction,
      surchargeRate: r.result.surchargeRate,
      refCalculatedTax,
      refCalculatedTaxNote: partAssetTax?.note,
      displayAcquisitionMode: r.item.displayAcquisitionMode,
      // [echo] 신고서 표가 단건과 같은 분기를 하도록 파생 입력을 그대로 실어 보낸다(세액 불변).
      filingDisplay: {
        estimatedBase: r.result.estimatedBase,
        estimatedDeduction: r.result.estimatedDeduction,
        swapApplied: r.result.swapApplied,
        commercialEstimatedAcquisition:
          r.result.commercialBuildingValuationDetail?.estimatedAcquisitionTotal,
        commercialEstimatedDeduction:
          r.result.commercialBuildingValuationDetail?.estimatedDeductionTotal,
        lthdHoldingPart: resolveLthdPartsEcho(r.result).holding,
        lthdResidencePart: resolveLthdPartsEcho(r.result).residence,
      },
      // [echo] §166 분할 열 게이트용 (표시 전용 — 세액 불변). 결과탭 코드리뷰 #080 ③.
      redevelopmentDetail: r.result.redevelopmentDetail,
      refDeterminedTax,
      reductionAmount: standalone,
      reductionType,
      reducibleIncome,
      reductionAggregated,
      reductionAllocationRatio,
      ...(r.reducibleAfterLoss ? { eligibleIncomeAfterLoss: reducibleIncomeOf(r) } : {}),
      ...pickReductionDetails(r.result),
      ...pickValuationDetails(r.result),
      penaltyTax: r.result.isExempt ? 0 : r.result.penaltyTax ?? 0,
      penaltyBase: r.result.isExempt ? 0 : r.result.penaltyBase ?? 0,
      filingDelayedPenaltyTax: r.result.isExempt ? 0 : r.result.penaltyDetail?.totalPenalty ?? 0,
      penaltyDetail: r.result.penaltyDetail,
      steps: r.result.steps,
      // 파트가 있는 자산의 문구는 1패스 단건 값이 아니라 통산·기본공제를 반영한 재계산 값이다.
      shortTermNote: partAssetTax ? partAssetTax.note : r.result.shortTermNote,
    };
  });

  return {
    properties,
    // 축 B × 부담부증여 — 물건 전체 §159 1건 (표시 전용, M-0.5)
    burdenedGift: withCardAcquisitions(burdenedGiftWhole, assetRecords),
    totalTransferGain: assetRecords.reduce((s, r) => s + r.result.transferGain, 0),
    totalLongTermHoldingDeduction: assetRecords.reduce((s, r) => s + r.lthd, 0),
    totalIncomeBeforeOffset: assetRecords.reduce((s, r) => s + r.income, 0),
    totalLoss: assetRecords
      .filter((r) => r.income < 0)
      .reduce((s, r) => s + Math.abs(r.income), 0),
    lossOffsetTable,
    unusedLoss,
    totalIncomeAfterOffset,
    basicDeduction: totalBasicDeduction,
    taxBase: groupTaxes.reduce((s, g) => s + g.groupTaxBase, 0),
    groupTaxes,
    calculatedTaxByGroups,
    calculatedTaxByGeneral,
    comparedTaxApplied,
    // §104⑤ 크로스 조정(부동산 8호 ↔ 주식 9호 · 부동산 1호 ↔ 기타자산 1호)용 echo — 타입 주석 참조
    clause8TaxBase,
    clause8Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
    calculatedTax,
    reductionAmount,
    reductionBreakdown,
    determinedTax: determinedTaxBeforePenalty,
    priorPaidTax: settlement.priorPaidTax,
    priorPaidLocalTax: settlement.priorPaidLocalTax,
    settlementAdditionalPayable: settlement.settlementAdditionalPayable,
    settlementRefund: settlement.settlementRefund,
    settlementLocalPayable: settlement.settlementLocalPayable,
    settlementLocalRefund: settlement.settlementLocalRefund,
    settlementTotalDue: settlement.settlementTotalDue,
    penaltyTax,
    // 가산세 상세는 자산별로 properties[i].penaltyDetail 에서 노출.
    ...(filingUnitPenaltyDetail ? { filingUnitPenaltyDetail } : {}),
    // [echo] 지방소득세 base에 실제로 들어간 가산세분 — 표시부가 base를 재현할 때 쓴다.
    // `penaltyTax`(총액)를 쓰면 「산출세액 ≠ 결정세액」 모순이 화면에 나온다.
    buildingPenaltyTax: perAssetBuildingPenalty,
    localIncomeTax,
    ruralSurtax: ruralSurtaxAll,
    totalTax,
    steps,
    warnings,
    ...(amendmentDetail ? { amendmentDetail } : {}),
  };
  };

  if (tieGroups.length === 0 && reducibleGroups.length === 0) return finishWith({}, steps, warnings);
  // 후보마다 하류를 임시 사본으로 돌려 가장 유리한 순서를 고른 뒤, 그 순서로 **정식으로 한 번 더** 계산한다 —
  // 하류가 자산 기록의 표시 플래그(`splitDetail.partRateBasisApplied`)를 덮어쓰므로 채택 후보가 마지막이어야 한다.
  // 세액이 같은 후보 사이의 순서(표시 규약) — 다건은 propertyId 사전순, 일괄양도는 한계세율 ↓ → 자산 번호 ↑.
  const idOf = (idx: number) => unitIdOf(assetRecords, units, idx);
  const rateOf = (idx: number) => assetRecords[unitAssetOf(units, idx)].result.appliedRate;
  const equalTaxOrder =
    input.sameDayEqualTaxOrder === "marginalRateThenAssetNumber"
      ? (a: number, b: number) => rateOf(b) - rateOf(a) || a - b
      : (a: number, b: number) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : a - b);
  const best = pickFavorableTieRank(tieGroups, equalTaxOrder, (c) => finishWith(c, [...steps], [...warnings]), reducibleGroups);
  return finishWith(best, steps, warnings);
}
