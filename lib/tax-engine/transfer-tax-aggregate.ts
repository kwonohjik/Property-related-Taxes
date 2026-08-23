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
import { resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
} from "./transfer-tax-aggregate-carryover-scope";
import { computeSettlement } from "./transfer-tax-settlement";
import { TRANSFER } from "./legal-codes";
import { TaxCalculationError } from "./tax-errors";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import {
  applyAnnualLimits,
  applyFiveYearLimits,
  buildLimitGroups,
  lookupLimit,
} from "./aggregate-reduction-limits";
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
  resolveTypeLegalBasis,
} from "./transfer-tax-aggregate-pickers";

export { classifyRateGroup };

import type { TaxRatesMap } from "@/lib/db/tax-rates";
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
    // 정밀 NBL 판정이 원시 플래그를 override한 경우, 결과가 노출한 판정값으로 item을 교정.
    // (원시 isNonBusinessLand=사용자 체크박스 vs 정밀판정=사업용 불일치 시 그룹·세율 오적용 방지)
    const nblJudgment = result.nonBusinessLandJudgmentDetail;
    const nblOverride = nblJudgment
      ? {
          isNonBusinessLand: nblJudgment.isNonBusinessLand,
          nonBusinessLandAreaRatio: nblJudgment.surcharge.nonBusinessAreaRatio,
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
    formula: `연 한도 ${annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()} = ${totalBasicDeduction.toLocaleString()} (${input.basicDeductionAllocation ?? "MAX_BENEFIT"} 배분)`,
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

  // M-8: 감면 합산 — 유형별 비율 재계산 (조특법 §69 + §127의2 + §133)
  // 1) 각 자산이 노출한 reducibleIncome을 유형별로 집계
  // 2) 합산 과세표준 기준으로 `safeMultiplyThenDivide(calculatedTax, 유형별 reducibleIncome, taxBase)` 재계산
  // 3) §133 유형별 연간 한도 적용 (자경·축산·어업 1억원 그룹 / 공익수용 2억원 단독 등)
  // 4) 유형이 없는 레거시 감면은 건별 단순 합산으로 폴백
  //
  // 분모 주의: 반드시 aggregate taxBase(차손 통산 + 기본공제 반영)여야 한다.
  // 합산양도소득금액이나 각 건별 taxBase를 쓰면 과대감면이 발생한다.
  // 세액감면(§69·§77 등) 비율 재계산 분모 — income-deduction 반영 후 과세표준(감면후 기준).
  const aggregateTaxBase = Math.max(
    0,
    taxableAfterReduction.reduce((s, v) => s + v, 0) - totalBasicDeduction,
  );
  const reducibleByType = new Map<string, { income: number; assetIds: string[] }>();
  for (const r of assetRecords) {
    if (r.result.isExempt) continue;
    const type = r.result.reductionTypeApplied;
    const income = r.result.reducibleIncome ?? 0;
    if (!type || income <= 0) continue;
    const existing = reducibleByType.get(type) ?? { income: 0, assetIds: [] };
    existing.income += income;
    existing.assetIds.push(r.item.propertyId);
    reducibleByType.set(type, existing);
  }

  // 조특법 §133 유형별 연간 한도 — `aggregate-reduction-limits.ts` 모듈 사용.
  // 유형별 원시 감면세액을 계산한 뒤 그룹 단위로 capping.
  const rawByType = new Map<string, number>();
  for (const [type, entry] of reducibleByType.entries()) {
    const raw =
      aggregateTaxBase > 0
        ? safeMultiplyThenDivide(calculatedTax, entry.income, aggregateTaxBase)
        : 0;
    rawByType.set(type, raw);
  }
  // §133 한도는 양도연도 분기 그룹(2025+ §77 그룹 2억/3억, 이전 1억/2억).
  const transferYear = input.taxYear;
  const limitGroups = buildLimitGroups(transferYear);
  const { cappedByType: annuallyCapped, capInfoByType } = applyAnnualLimits(rawByType, limitGroups);

  // §133 5년 누적 한도 추가 capping
  const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
    annuallyCapped,
    input.priorReductionUsage ?? [],
    transferYear,
    limitGroups,
  );
  const cappedByType = fiveYearCappedByType;

  const reductionBreakdown: ReductionBreakdownEntry[] = [];
  let totalAggregatedReduction = 0;
  for (const [type, entry] of reducibleByType.entries()) {
    const raw = rawByType.get(type) ?? 0;
    const capped = cappedByType.get(type) ?? 0;
    const info = capInfoByType.get(type);
    const fiveInfo = fiveYearCapInfoByType.get(type);
    const annualLimit =
      info && Number.isFinite(info.annualLimit) ? info.annualLimit : 0;
    const annuallyCappedReduction = annuallyCapped.get(type) ?? capped;
    const fiveYearLimitVal =
      fiveInfo && Number.isFinite(fiveInfo.fiveYearLimit) ? fiveInfo.fiveYearLimit : 0;
    reductionBreakdown.push({
      type,
      legalBasis: info?.legalBasis
        ? `${lookupLimit(type).groupTypes.length > 0 ? resolveTypeLegalBasis(type) : TRANSFER.REDUCTION_OVERLAP_EXCLUSION} + ${info.legalBasis}`
        : resolveTypeLegalBasis(type),
      totalReducibleIncome: entry.income,
      aggregateTaxBase,
      aggregateCalculatedTax: calculatedTax,
      rawAggregateReduction: raw,
      annualLimit,
      annuallyCappedReduction,
      cappedAggregateReduction: capped,
      cappedByLimit: info?.cappedByLimit ?? false,
      fiveYearLimit: fiveYearLimitVal,
      priorGroupSum: fiveInfo?.priorGroupSum ?? 0,
      fiveYearRemaining: fiveInfo && Number.isFinite(fiveInfo.remaining) ? fiveInfo.remaining : 0,
      cappedByFiveYearLimit: fiveInfo?.cappedByFiveYear ?? false,
      assetIds: entry.assetIds,
    });
    totalAggregatedReduction += capped;
  }

  // 유형이 지정되지 않은 감면(reducibleIncome 미노출 레거시 경로)은 건별 단순 합산
  const legacyReductionAmount = assetRecords.reduce((s, r) => {
    if (r.result.isExempt) return s;
    // 재계산 경로(reducibleByType)는 reducibleIncome>0 인 유형만 처리한다.
    // reductionTypeApplied는 있으나 reducibleIncome 미노출인 세액감면(§97·§98·§99 계열 등)은
    // 이 레거시 단순합에 포함해야 소실되지 않는다(건별 §127⑦ 이미 적용된 reductionAmount).
    if (r.result.reductionTypeApplied && (r.result.reducibleIncome ?? 0) > 0) return s;
    return s + (r.result.reductionAmount ?? 0);
  }, 0);

  const reductionAmount = Math.min(
    calculatedTax,
    totalAggregatedReduction + legacyReductionAmount,
  );

  // 세율군 혼재 시 경고 (PDF 사례 범위 외)
  if (comparedTaxApplied === "groups" && reducibleByType.size > 0) {
    warnings.push(
      "비교과세가 세율군별로 적용된 상황에서 감면 재계산은 전체 산출세액 기준으로 이루어졌습니다. 세율군 혼재 시 정확한 안분은 별도 로직이 필요합니다.",
    );
  }

  steps.push({
    label: "감면세액 (합산 재계산)",
    formula:
      reducibleByType.size > 0
        ? `유형별 재계산: ${[...reducibleByType.keys()].join(", ")} | 원시 ${totalAggregatedReduction === 0 ? "0" : totalAggregatedReduction.toLocaleString()} + 레거시 ${legacyReductionAmount.toLocaleString()}`
        : `건별 단순합 ${legacyReductionAmount.toLocaleString()} (유형 미지정 감면만 존재)`,
    amount: reductionAmount,
    legalBasis: TRANSFER.REDUCTION_ANNUAL_LIMIT,
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
  const penaltyTax = perAssetBuildingPenalty + perAssetFilingDelayedPenalty;

  // M-10: 지방소득세 (원 미만 절사 — 지방세법 §103의3)
  // 과세표준 = 결정세액 + §114조의2 건물 가산세만 (단건 엔진 finalize와 동일).
  // 신고불성실·납부지연 가산세(국세기본법 §47의2~5)는 지방소득세 부과대상이 아니므로 base 제외.
  const localIncomeTax = applyRate(determinedTaxBeforePenalty + perAssetBuildingPenalty, 0.1);
  // ── 감면 배분 선계산 — floor 잔액 말단 흡수 ────────────────────────────
  //
  // 2026-07-29 정정(#591 감사 R7 — 표시 자기일관성, 세액 불변): 같은 감면 유형의 자산들이
  // 각각 독립 floor되어 **Σ배분액이 cappedAggregateReduction과 최대 (n−1)원 어긋났다**.
  // 화면에는 "감면 합계"와 "자산별 감면"이 나란히 나오므로 1원 차이도 자기모순으로 보인다.
  //
  // 정책: 안분은 마지막 항목이 잔액을 흡수해 `Σ = 전체` 불변식을 지킨다
  // (memory `feedback_floor_residual_absorption`). 총 감면액(capped) 자체는 불변이므로
  // 세액에는 영향이 없다.
  const reductionAllocations = new Map<number, number>();
  {
    /** 감면유형 → 그 유형에 속하는 자산 인덱스(입력 순서 유지) */
    const groupIdx = new Map<string, number[]>();
    assetRecords.forEach((r, idx) => {
      const type = r.result.reductionTypeApplied;
      const reducible = r.result.isExempt ? 0 : r.result.reducibleIncome ?? 0;
      if (!type || reducible <= 0) return;
      const entry = reductionBreakdown.find((b) => b.type === type);
      if (!entry || entry.totalReducibleIncome <= 0) return;
      const list = groupIdx.get(type);
      if (list) list.push(idx);
      else groupIdx.set(type, [idx]);
    });

    for (const [type, idxList] of groupIdx) {
      const entry = reductionBreakdown.find((b) => b.type === type)!;
      let allocated = 0;
      idxList.forEach((idx, i) => {
        const isLast = i === idxList.length - 1;
        if (isLast) {
          // 말단 흡수 — 나머지 전액. floor 누적 오차가 여기로 모인다.
          reductionAllocations.set(idx, entry.cappedAggregateReduction - allocated);
          return;
        }
        const reducible = assetRecords[idx].result.reducibleIncome ?? 0;
        const share = Math.floor(
          entry.cappedAggregateReduction * (reducible / entry.totalReducibleIncome),
        );
        reductionAllocations.set(idx, share);
        allocated += share;
      });
    }
  }

  /**
   * 세액감면형 감면의 **농어촌특별세** — 단건 경로(STEP 8.8)와 **같은 판정표**를 쓴다.
   *
   * 위 `ruralSurtax`는 **소득금액 차감형**(§99의3 등) 전용이라 §77·§77의2·§77의3·§97 시리즈에는
   * 한 원도 붙지 않았다. 「농어촌특별세법」 §5①1호는 조특법 감면세액 × 20%를 정하고, 비과세는
   * 시행령 §4가 **열거**한 것뿐이다(§69는 비과세 · §77은 **직접 경작한 토지**만 비과세).
   *
   * 🔑 **자산별 배분액으로 판정한다** — 「직접 경작」 여부는 자산마다 다르므로 유형 합계로는
   *    가를 수 없다. 그래서 `reductionAllocations`(§133 한도까지 반영된 자산별 몫)를 쓴다.
   */
  let ruralSurtaxCredit = 0;
  for (const [idx, allocated] of reductionAllocations) {
    if (allocated <= 0) continue;
    const rec = assetRecords[idx];
    const verdict = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: rec.result.reductionTypeApplied,
      reductionAmount: allocated,
      isSelfCultivatedExpropriatedLand: (rec.item as { isSelfCultivatedExpropriatedLand?: boolean })
        .isSelfCultivatedExpropriatedLand,
    });
    ruralSurtaxCredit += verdict.surtax;
  }
  if (ruralSurtaxCredit > 0) {
    steps.push({
      label: "농어촌특별세 (감면세액 × 20%)",
      formula: `자산별 감면세액 합계 × 20% = ${ruralSurtaxCredit.toLocaleString()} (농어촌특별세법 §5①1호 · 시행령 §4 비과세 열거 제외분)`,
      amount: ruralSurtaxCredit,
      legalBasis: "농어촌특별세법 §5①1호",
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
    const effectiveRate = r.result.appliedRate + (r.result.surchargeRate ?? 0);
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

