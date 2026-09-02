/**
 * 양도소득세 다건 동시 양도 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 자산을 양도할 때 아래 규정을 반영한다:
 *   - §92              : 양도소득금액 합산 → 통합 과세표준
 *   - §102 ②·시행령 §167의2 : 양도차손 통산 (그룹 내 → 타군 pro-rata 안분, 이월 불인정)
 *   - §103             : 기본공제 연 1회 250만원, 미등기 배제
 *   - §104⑤          : 비교과세 MAX(세율군별 분리세액 합, 전체 누진세액)
 *   - 조특법 §127⑦    : 감면 중복배제는 건별 독립 적용 후 합산
 *
 * 순수 함수. DB 직접 호출 없음. 모든 세율 데이터는 rates 매개변수로 주입.
 * 기존 단건 엔진(`calculateTransferTax`)을 건별로 재사용하며, 상위에서 합산·통산·비교과세 수행.
 */

import {
  calculateTransferTax,
  parseRatesFromMap,
  type TransferTaxInput,
  type CalculationStep,
} from "./transfer-tax";
import { computeAmendment } from "./transfer-tax-amendment";
import { calculateTransferTaxPenalty } from "./transfer-tax-penalty";
import {
  aggregateReductions,
  allocateAggregateReductions,
  computeAggregateTaxCreditRuralSurtax,
} from "./transfer-tax-aggregate-reduction-step";
import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
} from "./transfer-tax-aggregate-carryover-scope";
import { computeSettlement } from "./transfer-tax-settlement";
import { TRANSFER } from "./legal-codes";
import { TaxCalculationError } from "./tax-errors";
import { applyRate } from "./tax-utils";
import {
  validateInput,
  classifyRateGroup,
  offsetLosses,
  allocateBasicDeduction,
} from "./transfer-tax-aggregate-helpers";
// picker 6종 + 세율군 1-pass 집계 — 800줄 정책 분리(Phase A-0)
import {
  pickValuationDetails,
  pickReductionDetails,
  incomeDeductionReducibleOf,
  ruralSurtaxExemptReducibleOf,
  computeGroupsAndComparison,
} from "./transfer-tax-aggregate-pickers";

export { classifyRateGroup };

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
// transfer-tax-penalty 직접 호출 없음 — 자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행.

// ============================================================
// 타입 — ./types/transfer-aggregate.types 로 분리 (800줄 정책)
// 기존 소비자들을 위해 본체 파일에서 재수출한다.
// ============================================================

import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
} from "./types/transfer-aggregate.types";

/**
 * 기본공제 배분 전략 → 화면 라벨.
 * 산식 문자열에 내부 enum 값(`MAX_BENEFIT` …)이 그대로 나가던 것을 막는다
 * (memory `feedback_no_internal_id_in_result`). 표시 전용 — 세액 불변.
 */
const BASIC_DEDUCTION_ALLOCATION_LABEL: Record<
  "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER",
  string
> = {
  MAX_BENEFIT: "세액이 가장 크게 줄어드는 자산 우선",
  FIRST: "첫 번째 자산",
  EARLIEST_TRANSFER: "양도일이 빠른 자산",
};

export type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
};

/**
 * **[표시 전용]** 배우자등 이월과세(§97의2) 자산의 「취득가액 열」 정본 —
 * 채택 시나리오의 취득가액. 이월과세 자산이 아니면 `undefined`(호출측이 종전 축을 쓴다).
 *
 * ## 왜 필요한가 — 취득가액 열만 STEP 0.475 **이전** 축에 남아 있었다
 *
 * 단건 엔진은 STEP 0.475에서 `workingInput`을 **채택 시나리오의 입력**으로 갈아탄 뒤
 * `transferGain`을 산출한다(`transfer-tax.ts`). 그런데 아래 호출부의 종전 취득가액은
 * `r.singleInput`(= 갈아타기 **전** 원본)에서 왔다. 두 값이 서로 다른 시점을 보므로
 * 신고서 열이 이렇게 어긋난다:
 *
 * | 픽스처 | 취득가액 열(종전) | 필요경비 열(종전) | 채택 취득가액 |
 * |---|---|---|---|
 * | 함께양도 primary 이월과세 · B 채택 | **0** | **300,000,000** | 300,000,000 |
 * | 일반건물 토지 파트 이월과세 · A 채택 | 250,000,000(수증자 환산) | **−70,000,000** | 150,000,000 |
 *
 * 필요경비가 음수인 경우 UI clamp(`Math.max(0, …)` —
 * `FilingFormTableAggregateHelpers` · `DetailedStatementHelpers`)에 잘려
 * 「양도가액 − 취득가액 − 필요경비 = 양도차익」 자기검산이 **화면에서** 깨진다
 * (위 GB 픽스처 실측: 500,000,000 − 250,000,000 − 0 = 250,000,000 ≠ 320,000,000).
 *
 * ## 왜 재도출이 아니라 채택값 참조인가
 *
 * 「A면 증여자 취득가액, B면 증여 당시 평가액」을 여기서 다시 유도하면 시나리오 입력 구성이
 * 바뀔 때 한쪽만 따라가는 dual-truth가 된다. 두 값은 **단건이 실제로 쓴 취득가액**이다 —
 * A는 `inputAFinal.acquisitionPrice`(환산 모드면 §97①1호나목 환산액), B는
 * `buildInputB`의 `acquisitionPrice`(= `giftDateValuation`)이고, 적용배제 조기반환
 * (관계·기간·수용·1세대1주택·가업상속) 역시 전부 `adoptedScenario: "B"` +
 * `makeEmptyScenarioB(giftDateValuation)`이라 같은 값으로 수렴한다
 * (`transfer-tax-carryover.ts`).
 *
 * 🔒 **세액 불변** — 취득가액·필요경비 열은 `PerPropertyBreakdown`의 표시 필드이고
 *    세액 경로(`taxableAfterReduction`·`groupTaxes`)는 이 값을 읽지 않는다.
 *    직전 `adoptedRateBasis` echo(M-1)와 같은 「채택 결과를 표시 축에 반영」 패턴이다.
 */
function adoptedCarryoverAcquisitionPrice(
  detail:
    | {
        adoptedScenario: "A" | "B";
        scenarioA: { acquisitionPrice: number };
        scenarioB: { acquisitionPrice: number };
      }
    | undefined,
): number | undefined {
  if (!detail) return undefined;
  return detail.adoptedScenario === "A"
    ? detail.scenarioA.acquisitionPrice
    : detail.scenarioB.acquisitionPrice;
}

// ============================================================
// 메인 진입점
// ============================================================

/**
 * 집계 1회 계산 — **주어진 이월과세 시나리오 assignment 하에서** 신고 전체를 계산한다.
 *
 * 공개 진입점은 아래 {@link calculateTransferTaxAggregate}다. 그쪽이 §97의2②3호를
 * **신고단위 결정세액**으로 판정하기 위해 이 함수를 여러 번 부른다.
 */
function computeAggregateOnce(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
  carryoverOverrides: CarryoverScenarioOverrides,
): AggregateTransferResult {
  const warnings: string[] = [];
  const steps: CalculationStep[] = [];

  // M-0: 검증
  validateInput(input);

  // M-1: 건별 단건 엔진 호출 (기본공제 스킵, 차손 허용)
  const perAsset = input.properties.map((item, assetIdx) => {
    const singleInput: TransferTaxInput = {
      ...(item as unknown as TransferTaxInput),
      annualBasicDeductionUsed: 0,
      skipBasicDeduction: true,
      skipLossFloor: true,
      // [E4] 신고서 단위 amendment가 route에서 primary item에 spread돼도 자산별 계산에
      // 누수되지 않도록 strip. 정정은 아래 집계 결정세액에 대해 1회만 계산한다(§3.3 누수 버그 수정).
      amendment: undefined,
    };
    // 자산 단위 계산 오류에 **자산 번호를 붙인다** — 이 루프에는 try/catch가 없어 예외가
    // 그대로 route까지 전파되는데, 다건에서는 어느 자산이 원인인지 메시지만으로 알 수 없다.
    let result;
    try {
      // §97의2②3호 — 신고단위 비교 결과를 내려보낸다(지정 없으면 단건 엔진이 자체 판정).
      const scenarioOverride = carryoverOverrides[assetIdx];
      result = calculateTransferTax(
        singleInput,
        rates,
        scenarioOverride ? { carryoverScenarioOverride: scenarioOverride } : undefined,
      );
    } catch (e: unknown) {
      if (e instanceof TaxCalculationError) {
        throw new TaxCalculationError(e.code, `자산 ${assetIdx + 1}: ${e.message}`, {
          ...(e.details ?? {}),
          assetIndex: assetIdx + 1,
        });
      }
      throw e;
    }
    /**
     * 🔴 **단건 경고를 집계가 통째로 버리고 있었다** (2026-08-26 · R-5 실측).
     *
     * `computeAggregateOnce`는 `warnings` 배열을 만들고 **한 번도 채우지 않았다**
     * (`warnings.push` 0건). 그래서 §89② 판정 불가 안내·§155⑦3호 귀농 사후관리·
     * §156의2⑬ 추징 등 **모든 단건 경고**가 다건·일괄양도에서 사라졌다.
     *
     * ⚠️ 자산이 여럿이므로 **어느 자산의 경고인지** 라벨을 붙인다 — 안 붙이면 3자산 번들에서
     *    같은 문구가 세 번 나오고 무엇을 확인해야 하는지 알 수 없다.
     * ⚠️ 같은 자산에서 중복은 그대로 둔다(단건 엔진이 이미 dedupe한다).
     */
    for (const w of result.warnings ?? []) {
      const label = item.propertyLabel ? `[${item.propertyLabel}] ` : "";
      const line = `${label}${w}`;
      if (!warnings.includes(line)) warnings.push(line);
    }

    // 정밀 NBL 판정이 원시 플래그를 override한 경우, 결과가 노출한 판정값으로 item을 교정.
    // (원시 isNonBusinessLand=사용자 체크박스 vs 정밀판정=사업용 불일치 시 그룹·세율 오적용 방지)
    const nblJudgment = result.nonBusinessLandJudgmentDetail;
    /**
     * 🔴 STEP 0.62(상업용건물 부수토지 초과분)도 `nblOverride`의 소스여야 한다 (E6-01, 2026-09-02 코드리뷰).
     *
     * 단건 엔진은 `runCommercialAppurtenantLandStep`이 `effectiveInput`에
     * `isNonBusinessLand: true` + `nonBusinessLandAreaRatio`를 **파생 주입**하고 그 값으로 세율을 정한다.
     * 그런데 그 파생 입력은 result에 echo되지 않아 여기 `correctedSingleInput`에 복원되지 않았고,
     * 그룹 세액 재계산에서 「소득세법」 §104①8호 +10%p가 통째로 사라졌다
     * (실측 그룹세액 −14,403,750원 → §104⑤ 1호 바닥 완충 후 최종 **11,683,750원 과소**).
     * clause8 echo도 0이 되어 §104⑤ 8호 크로스 조정이 함께 소실됐다.
     *
     * ⇒ 단건 엔진과 **같은 leaf**(`judgeAppurtenantLandExcess`)로 재판정한다. 값을 새로 배관하는
     *    대신 같은 함수를 부르므로 dual truth가 생기지 않는다(구분소유 지분율은 판정식에서 약분된다).
     */
    const cal = item.commercialAppurtenantLand;
    const calExcess =
      !nblJudgment && item.propertyType === "commercial_building" && cal
        ? judgeAppurtenantLandExcess({
            landArea: cal.totalLandArea,
            buildingFootprintArea: cal.totalBuildingFootprintArea,
            zoneType: cal.zoneType,
            unapprovedBuilding: cal.unapprovedBuilding,
            context: "상업용건물",
          })
        : undefined;
    const nblOverride = nblJudgment
      ? {
          isNonBusinessLand: nblJudgment.isNonBusinessLand,
          nonBusinessLandAreaRatio: nblJudgment.surcharge.nonBusinessAreaRatio,
        }
      : calExcess && calExcess.nonBusinessArea > 0
        ? {
            isNonBusinessLand: true,
            nonBusinessLandAreaRatio: calExcess.nonBusinessRatio,
          }
        : undefined;
    /**
     * 배우자등 이월과세(§97의2) — **채택된 시나리오의 §104② 기산 사실**로 item을 교정.
     *
     * 단건 엔진은 STEP 0.475에서 `workingInput`을 채택 시나리오 입력으로 갈아탄 뒤 세율을
     * 정한다(A=증여자 취득일·`gift` / B=증여 등기접수일·`purchase`). 그런데 여기 `item`은
     * **원본**이라 `acquisitionCause`가 `"carryover_gift"` 그대로다 —
     * 아래 두 소비자가 **채택 결과를 못 보고** 최상위 `donorAcquisitionDate` 유무만으로 갈렸다:
     *   · `classifyRateGroup`      (M-2 세율군 = §104⑤ 버킷·§102② 통산 범위·기본공제 우선순위)
     *   · `aggregateByGroup`→`calcTax` (`correctedSingleInput`이 곧 `taxRateInput`)
     *
     * 실측(토지 10억 · 증여자 2010-01-01 취득 · 2025-09-01 증여 · 2026-06-01 양도, mock 세율):
     *   · **A 채택**인데 `short_term`으로 분류 → 단건 228,660,000 vs 일괄 315,000,000 (**+86,340,000 과대**)
     *   · **B 채택**인데 `progressive`로 분류 → 단건 350,000,000 vs 일괄 258,060,000 (**−91,940,000 과소**)
     * 두 방향이 **정확히 반대**라 최상위 `donorAcquisitionDate` 배선만으로는 한쪽을 고치면
     * 다른 쪽이 깨진다 — 교정은 「채택 결과를 반영」하는 이 층에서만 성립한다.
     * anchor `aggregate-carryover-adopted-rate-basis.anchor.test.ts` (되돌리면 C-2·C-5·C-6 3건 red).
     *
     * ⚠️ 사실을 그대로 덮어쓸 뿐 「어느 세율군인가」를 넘기지 않는다(엔진 헬퍼는 사실만 받는다).
     */
    const rateBasisOverride = result.carryoverTaxationDetail?.adoptedRateBasis;
    const hasOverride = nblOverride !== undefined || rateBasisOverride !== undefined;
    const correctedItem: TransferTaxItemInput = hasOverride
      ? { ...item, ...nblOverride, ...rateBasisOverride }
      : item;
    const correctedSingleInput: TransferTaxInput = hasOverride
      ? { ...singleInput, ...nblOverride, ...rateBasisOverride }
      : singleInput;
    return { item, correctedItem, correctedSingleInput, singleInput, result };
  });

  // M-2: 세율군 분류 — 정밀판정·이월과세 채택 교정 item 기준 (원시 플래그 오분류 방지)
  const classified = perAsset.map((pa) => ({
    ...pa,
    rateGroup: classifyRateGroup(pa.correctedItem, pa.result),
  }));

  // 자산별 원시 income 및 세율군 정리
  // 장특공제는 양수 양도차익에만 적용되므로 (소득세법 §95②), 차손 자산은 income = transferGain
  const assetRecords = classified.map((pa) => {
    if (pa.result.isExempt) {
      return { ...pa, taxableGain: 0, lthd: 0, income: 0 };
    }
    const transferGain = pa.result.transferGain;
    if (transferGain < 0) {
      return { ...pa, taxableGain: transferGain, lthd: 0, income: transferGain };
    }
    const taxableGain = pa.result.taxableGain;
    const lthd = pa.result.longTermHoldingDeduction;
    const income = taxableGain - lthd;
    return { ...pa, taxableGain, lthd, income };
  });

  // M-3: §102② 차손 통산
  const {
    lossOffsetTable,
    lossOffsetFromSame,
    lossOffsetFromOther,
    incomeAfterOffset,
    unusedLoss,
  } = offsetLosses(assetRecords);

  // income-deduction 감면(§99의3·§99·§98의8·하이브리드 5년후) — 세액 계산용 "감면후 income" 분리.
  // incomeAfterOffset(pre-감면)는 양도소득금액 표시·차손통산·농특세 감면前 기준으로 보존.
  //
  // 시행령 §167의2② — 자산이 통산받은 양도차손은 순양도소득금액:감면소득금액 비율로 안분하고,
  // 감면소득금액을 감면분 차손만큼 축소한 값을 법 §90 감면소득금액으로 본다. (차손 미수령이면 축소 0.)
  const incomeDeductionReducible = assetRecords.map((r, i) => {
    const reducible = incomeDeductionReducibleOf(r.result);
    if (reducible <= 0) return 0;
    const income = r.income; // 통산 前 양도소득금액(감면소득금액 포함) — 안분 분모
    if (income <= 0) return reducible;
    const lossReceived = lossOffsetFromSame[i] + lossOffsetFromOther[i];
    const lossToExempt = Math.floor((lossReceived * reducible) / income); // 감면분 흡수 차손(절사·순분 잔여흡수)
    return Math.max(0, reducible - lossToExempt);
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
    .map((r, idx) => ({ idx, rateGroup: r.rateGroup, income: taxableAfterReduction[idx], isExempt: r.result.isExempt, transferDate: r.item.transferDate, rate: r.result.appliedRate }))
    .filter((r) => !r.isExempt && r.rateGroup !== "unregistered" && r.income > 0);

  const allocation = allocateBasicDeduction(
    eligibleForBasic,
    availableThisCalc,
    input.basicDeductionAllocation ?? "MAX_BENEFIT",
  );
  const allocatedBasic: number[] = assetRecords.map(() => 0);
  for (const a of allocation) allocatedBasic[a.idx] = a.amount;
  const totalBasicDeduction = allocatedBasic.reduce((s, v) => s + v, 0);

  steps.push({
    label: "기본공제",
    formula: `연 한도 ${annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()} = ${totalBasicDeduction.toLocaleString()} (${BASIC_DEDUCTION_ALLOCATION_LABEL[input.basicDeductionAllocation ?? "MAX_BENEFIT"]} 배분)`,
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
    calculatedTax,
    comparedTaxApplied,
    assetPartTax,
    clause8TaxBase,
    clause8Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
  } = computeGroupsAndComparison(assetRecords, taxableAfterReduction, allocatedBasic, rates);

  steps.push({
    label: "비교과세 (§104⑤)",
    formula: `세율군별 ${calculatedTaxByGroups.toLocaleString()} vs 전체누진 ${calculatedTaxByGeneral.toLocaleString()} → ${comparedTaxApplied === "none" ? "비교 불필요 (중과·단기 없음)" : `MAX = ${calculatedTax.toLocaleString()} (${comparedTaxApplied === "groups" ? "세율군별" : "전체누진"})`}`,
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
    const beforeTax = computeGroupsAndComparison(assetRecords, surtaxBaseline, allocatedBasic, rates).calculatedTax;
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
  const { reductionBreakdown, reductionAmount } = aggregateReductions({
    assetRecords,
    calculatedTax,
    taxableAfterReduction,
    totalBasicDeduction,
    taxYear: input.taxYear,
    priorReductionUsage: input.priorReductionUsage ?? [],
    comparedByGroups: comparedTaxApplied === "groups",
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
                // 미납세액 0 = 결정세액 전액 미납으로 본다(단건 route와 같은 규약).
                unpaidTax:
                  input.delayedPaymentDetails.unpaidTax === 0
                    ? determinedTaxBeforePenalty
                    : input.delayedPaymentDetails.unpaidTax,
              }
            : undefined,
        })
      : undefined;

  const penaltyTax =
    perAssetBuildingPenalty +
    perAssetFilingDelayedPenalty +
    (filingUnitPenaltyDetail?.totalPenalty ?? 0);

  // M-10: 지방소득세 (원 미만 절사 — 지방세법 §103의3)
  // 과세표준 = 결정세액 + §114조의2 건물 가산세만 (단건 엔진 finalize와 동일).
  // 신고불성실·납부지연 가산세(국세기본법 §47의2~5)는 지방소득세 부과대상이 아니므로 base 제외.
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
        fp && fp.filingPenalty > 0
          ? `신고불성실 ${fp.penaltyBase.toLocaleString()} × ${(fp.penaltyRate * 100).toFixed(0)}%`
          : null,
        dp && dp.delayedPaymentPenalty > 0
          ? `납부지연 ${dp.unpaidTax.toLocaleString()} × ${dp.elapsedDays}일 × ${(dp.dailyRate * 100).toFixed(3)}%`
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
    const reducibleIncome = r.result.isExempt ? 0 : r.result.reducibleIncome ?? 0;
    const standalone = r.result.isExempt ? 0 : r.result.reductionAmount ?? 0;

    // 유형별 재계산 엔트리가 있으면 비율 배분, 없으면 단독값 그대로
    let reductionAggregated = standalone;
    let reductionAllocationRatio = 0;
    if (reductionType && reducibleIncome > 0) {
      const entry = reductionBreakdown.find((b) => b.type === reductionType);
      if (entry && entry.totalReducibleIncome > 0) {
        reductionAllocationRatio = reducibleIncome / entry.totalReducibleIncome;
        // 배분액은 위 선계산(말단 잔액 흡수)에서 가져온다 — 여기서 재-floor하면 드리프트가 되살아난다.
        reductionAggregated = reductionAllocations.get(idx) ?? reductionAggregated;
      }
    }

    // 실제 적용 취득가액 (환산 시 재산식), 필요경비는 §97 개산공제 포함 역산
    const tsfStd = r.singleInput.standardPriceAtTransfer ?? 0;
    const effectiveAcquisitionPrice =
      adoptedCarryoverAcquisitionPrice(r.result.carryoverTaxationDetail) ??
      (r.result.usedEstimatedAcquisition
        ? (tsfStd > 0
            ? Math.floor((r.singleInput.transferPrice * (r.singleInput.standardPriceAtAcquisition ?? 0)) / tsfStd)
            : 0)
        : r.singleInput.acquisitionPrice);
    // 비과세 자산: gross(exemptGrossGain)와 취득가액으로 필요경비 역산(환산 시 개산공제분).
    //   → 신고서 양식 컬럼 교차검산(양도가액 − 취득가액 − 필요경비 = 전체 양도차익) 정합.
    // 비-비과세: 엔진 transferGain으로 역산(개산공제·양도비 포함).
    const effectiveNecessaryExpense = r.result.isExempt
      ? Math.max(0, r.singleInput.transferPrice - effectiveAcquisitionPrice - (r.result.exemptGrossGain ?? 0))
      : r.singleInput.transferPrice - effectiveAcquisitionPrice - r.result.transferGain;

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
      exemptReason: r.result.exemptReason,
      transferPrice: r.singleInput.transferPrice,
      acquisitionPrice: effectiveAcquisitionPrice,
      necessaryExpense: effectiveNecessaryExpense,
      // 신고서 양식: 자본적지출은 취득가액에 합산, 필요경비는 양도비만
      capitalExpenditureForDisplay: r.singleInput.capitalExpenditure ?? 0,
      determinedTax: r.result.determinedTax,
      transferGain: r.result.transferGain,
      exemptGrossGain: r.result.exemptGrossGain, // [echo] 비과세 gross (표시 전용). transferGain·:444 불변.
      longTermHoldingDeduction: r.lthd,
      income: r.income,
      rateGroup: r.rateGroup,
      lossOffsetFromSameGroup: lossOffsetFromSame[idx],
      lossOffsetFromOtherGroup: lossOffsetFromOther[idx],
      incomeAfterOffset: incomeAfterOffset[idx],
      incomeDeductionReducible: incomeDeductionReducible[idx],
      allocatedBasicDeduction: allocatedBasic[idx],
      taxBaseShare,
      appliedRate: r.result.appliedRate,
      progressiveDeduction: r.result.progressiveDeduction,
      surchargeRate: r.result.surchargeRate,
      refCalculatedTax,
      refCalculatedTaxNote: partAssetTax?.note,
      // [echo] §166 분할 열 게이트용 (표시 전용 — 세액 불변). 결과탭 코드리뷰 #080 ③.
      redevelopmentDetail: r.result.redevelopmentDetail,
      refDeterminedTax,
      reductionAmount: standalone,
      reductionType,
      reducibleIncome,
      reductionAggregated,
      reductionAllocationRatio,
      ...pickReductionDetails(r.result),
      ...pickValuationDetails(r.result),
      penaltyTax: r.result.isExempt ? 0 : r.result.penaltyTax ?? 0,
      penaltyBase: r.result.isExempt ? 0 : r.result.penaltyBase ?? 0,
      filingDelayedPenaltyTax: r.result.isExempt ? 0 : r.result.penaltyDetail?.totalPenalty ?? 0,
      penaltyDetail: r.result.penaltyDetail,
      steps: r.result.steps,
      shortTermNote: r.result.shortTermNote,
    };
  });

  return {
    properties,
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
}


// ============================================================
// 공개 진입점 — §97의2②3호를 **신고단위 결정세액**으로 판정한다
// ============================================================

/**
 * 다건 양도소득세 집계.
 *
 * 단건 엔진은 §97의2②3호의 A/B 비교를 **자기 자산만 놓고** 한다. 자산이 1건이면 그 값이 곧
 * 신고 전체의 결정세액이라 옳지만, **여러 건이면 틀린다** — A/B 전환이 세율군을 바꿔
 * §104⑤ 누진 합산·§102② 통산·§103 기본공제 배분이 함께 움직이기 때문이다
 * (`transfer-tax-aggregate-carryover-scope.ts` 머리주석 · 실측 300 격자 중 7건, 전부 과소).
 *
 * 그래서 여기서 집계를 여러 번 돌려 **신고 전체 결정세액**으로 비교하고, 그 결과를
 * `carryoverScenarioOverride`로 단건 엔진에 내려보낸다.
 *
 * **자산 1건이거나 이월과세 자산이 없으면 호출 1회**로 종전과 동일하게 끝난다.
 */
export function calculateTransferTaxAggregate(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
): AggregateTransferResult {
  const memo = new Map<string, AggregateTransferResult>();
  const run = (overrides: CarryoverScenarioOverrides): AggregateTransferResult => {
    const key = JSON.stringify(overrides);
    const hit = memo.get(key);
    if (hit) return hit;
    const computed = computeAggregateOnce(input, rates, overrides);
    memo.set(key, computed);
    return computed;
  };

  // 1) 강제 없이 1회 — ②1호·②2호·③ 기간·관계로 **이미 배제된** 자산을 가려낸다.
  //    그 배제들은 ②3호보다 앞서므로 비교 대상이 아니다(`finishScenarios` 조기 반환).
  const baseline = run({});
  const eligible = baseline.properties.flatMap((p, idx) =>
    p.carryoverTaxationDetail?.isEligible === true ? [idx] : [],
  );
  if (eligible.length === 0) return baseline;

  // 2) 신고단위 비교로 채택 시나리오 확정
  const { overrides, comparisons } = resolveFilingUnitCarryoverScope(
    eligible,
    (ov) => run(ov).determinedTax,
  );
  const final = run(overrides);

  // 3) 비교 실적을 자산별 detail에 실어 준다 — 결과 화면이 **신고단위 두 값**을 그대로 보여준다.
  //    (단건 세액만 보여주면 「A가 작은데 A를 채택했다」는 자기모순 화면이 된다.)
  return {
    ...final,
    properties: final.properties.map((p, idx) => {
      const cmp = comparisons.get(idx);
      const detail = p.carryoverTaxationDetail;
      if (!cmp || !detail) return p;
      return { ...p, carryoverTaxationDetail: { ...detail, filingUnitComparison: cmp } };
    }),
  };
}

// 헬퍼 영역(M-0 검증 / M-2 세율군 / M-3 차손통산 / M-4 기본공제 / M-5 그룹집계 / M-6 누진)은
// `transfer-tax-aggregate-helpers.ts` 로 분리되었다 (800줄 정책 준수).

// 위 헬퍼들은 헬퍼 파일로 이동.

