/**
 * 주택·건물 **토지·건물 분리 계산의 파트 이월과세**(소득세법 §97의2①) 시나리오 해결자 — STEP 0.476.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §3·§4·§5·§7
 * 계획: docs/00-pm/transfer-split-part-carryover.plan.md §11 (통합 결정 I-1~I-9)
 *
 * ## 한 줄 요약
 * 이월과세 **적용(A)** 파트는 취득일·취득가액을 **증여자 값**으로, **미적용(B)** 파트는 증여 등기접수일·증여 당시 평가액으로 둔
 * **일반 split 입력**을 만든다. 그 입력으로 `calculateTransferTax`를 다시 부르므로 `calcSplitGain`·장특·세율·§104⑤ 엔진은 한 줄도
 * 바뀌지 않고, 장특 `holdingYears`와 세율 기산이 **같은 치환 날짜**를 읽어 두 기산이 구조적으로 일치한다.
 *
 * ## 순수성
 * Layer 2 — DB 호출 없음. 세율은 인자(`rates`)로 받고, 본 엔진은 **주입**(`calculate`)받는다(`calcCarryoverScenarios`와 같은 구조 — 순환 의존 회피).
 * 재귀 입력은 파트 서브객체 3키를 비우므로 무한 루프가 없다.
 *
 * ## ②3호 — 파트별 A/B (N-1 사용자 결정 승계)
 * 이월과세 적격 파트(토지=0·건물=1)를 모두 A로 두고 **순차 고정점**(`resolveFilingUnitCarryoverScope`, 동률 A, 토지 → 건물, 최대 2 pass)으로
 * 정한다. 2ⁿ 전수 탐색은 조문에 없는 최적화라 쓰지 않는다. 비교 대상은 파트 세액을 쪼갠 값(`refCalculatedTax` 역안분 — 금지)이 아니라
 * **자산 전체 결정세액**(§92③2호)을 두 번 돌린 값이다.
 *
 * ## 증여세 상당액 (영 §163의2②)
 * 안분은 ⑭ 합성기(`composeSplitCarryover`)가 이미 했다(`ct.giftTaxAmount`, 한도 前). 한도는 「양도가액에서 §97①·②의 금액을 공제한 잔액」이고,
 * 사전-2025-법규재산-0366의 「해당 자산」에 따라 **그 파트의 양도차익**이다(자산 단위가 아니다 — 실측으로 echo가 갈린다, anchor SPCO-T4).
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { TRANSFER } from "./legal-codes";
import { carryoverExclusionReasonLabel } from "./transfer-carryover-exclusion-labels";
import {
  collectSplitPartCauseIssues,
  PART_CARRYOVER_ONE_HOUSE_MESSAGE,
} from "./transfer-split-part-cause";
import { dayKey, splitPartCauseFactsOfInput } from "./transfer-split-part-cause-input";
import { calcSplitGain } from "./transfer-tax-split-gain";
import { judgeCarryoverEligibility, type CarryoverEligibility } from "./transfer-tax-carryover-eligibility";
import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
} from "./transfer-tax-aggregate-carryover-scope";
import { DONOR_CAPEX_EFFECTIVE_DATE } from "./transfer-tax-carryover";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "./types/transfer.types";
import type { CarryoverTaxationInput } from "./types/transfer-carryover.types";
import type {
  SplitCarryoverEventEcho,
  SplitGainResult,
  SplitPartCarryoverEcho,
  SplitPartResult,
} from "./types/transfer-split-gain.types";

type PartKey = "land" | "building";
type Side = "A" | "B";

/** ②3호 드라이버의 자산 index — 조문 열거 순서(§94①1호: 토지 → 건물). 안정 구성이 둘일 때 순서가 결과를 가른다(V-8). */
const INDEX: Record<PartKey, number> = { land: 0, building: 1 };

export interface SplitCarryoverDetail {
  land?: SplitPartCarryoverEcho;
  building?: SplitPartCarryoverEcho;
  event: SplitCarryoverEventEcho;
}

/** 해결자가 부르는 본 엔진 — 결정세액과 §89①3호 비과세 여부만 읽는다. */
type CalculateFn = (
  input: TransferTaxInput,
  rates: TaxRatesMap,
) => { determinedTax: number; isExempt?: boolean; isPartialExempt?: boolean };

interface PartPlan {
  key: PartKey;
  ct: CarryoverTaxationInput;
  eligibility: CarryoverEligibility;
  /** 양도일이 2024.1.1. 전이면 0 (§97의2①2호 시행시기) */
  donorCapex: number;
  donorCapexGuardApplied: boolean;
  /** 영 §163의2② 후단 한도 = 그 파트 양도차익 (적격 파트만) */
  giftTaxCap: number;
  /** 필요경비에 얹는 증여세 상당액 = min(안분액, 한도) — A 시나리오에서만 쓴다 */
  giftTaxAdded: number;
  giftTaxLimitApplied: boolean;
}

type Plans = Partial<Record<PartKey, PartPlan>>;

/**
 * 시나리오 입력 — 파트마다 A(증여자 값) / B(수증자 값)을 골라 만든 **일반 split 입력**.
 *
 * | 필드 | 파트 A | 파트 B |
 * |---|---|---|
 * | 취득일 | 증여자 취득일 | 증여 등기접수일(원 입력) |
 * | 취득가액 | 증여자 취득가액 | 증여 당시 평가액(원 입력) |
 * | 파트 필요경비 | 원값 + 증여자 자본적지출 + 증여세 상당액 | 원값 |
 */
function buildScenarioInput(
  raw: TransferTaxInput,
  plans: Plans,
  sideOf: Record<PartKey, Side>,
  addedOf: Record<PartKey, number>,
): TransferTaxInput {
  const next: TransferTaxInput = {
    ...raw,
    // 건물 파트가 이월과세 대상이었으면 `purchase`로 둔다 — `carryover_gift`로 두면 배제 자산에 §104②2호 통산이 들어가 과소과세가 된다
    // (`buildInputB`와 같은 이유, `transfer-tax-carryover.ts` 주석). A 파트의 증여자 기산은 아래 취득일 치환이 만든다.
    acquisitionCause: plans.building ? "purchase" : raw.acquisitionCause,
    // 토지 overlay·§104②1·2호 입력은 치환 날짜로 이미 반영된다 — 비우지 않으면 leaf가 S1/Y8로 다시 막고 세율 기산이 이중으로 읽힌다.
    landAcquisitionCause: undefined,
    landDecedentAcquisitionDate: undefined,
    landDonorAcquisitionDate: undefined,
    // 재귀 방지(R-4) — 서브객체 3키를 비운다. 이 입력은 STEP 0.476을 다시 타지 않는다.
    landCarryoverTaxation: undefined,
    buildingCarryoverTaxation: undefined,
    carryoverGiftEvent: undefined,
    // §99의4·§98의9 「그 주택 취득 전에 보유하던」 판정은 수증자 본인 취득일이다 — 건물 A 치환이 취득순서를 앞당기지 않게 원 취득일을 고정한다.
    houseCountExclusionAcquisitionDate: raw.houseCountExclusionAcquisitionDate ?? raw.acquisitionDate,
  };
  const land = plans.land;
  if (land && sideOf.land === "A") {
    next.landAcquisitionDate = land.ct.donorAcquisitionDate;
    next.landAcquisitionPrice = land.ct.donorAcquisitionPrice ?? 0;
    next.landDirectExpenses = (raw.landDirectExpenses ?? 0) + land.donorCapex + addedOf.land;
  }
  const building = plans.building;
  if (building && sideOf.building === "A") {
    next.acquisitionDate = building.ct.donorAcquisitionDate;
    next.buildingAcquisitionPrice = building.ct.donorAcquisitionPrice ?? 0;
    next.buildingDirectExpenses = (raw.buildingDirectExpenses ?? 0) + building.donorCapex + addedOf.building;
  }
  // 엔진은 별개 취득을 재판정하지 않는다(`transfer-tax-split-gain.ts` 주석) — 치환 날짜로 매 시나리오 다시 파생한다.
  // 안 하면 둘 다 증여일(비-별개)에서 한쪽만 A가 됐을 때 §166⑥ 기준시가 안분 경로를 탄다.
  next.isSeparateAcquisition = dayKey(next.landAcquisitionDate) !== dayKey(next.acquisitionDate);
  return next;
}

const NONE: Record<PartKey, number> = { land: 0, building: 0 };

export function calcSplitCarryoverScenarios(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  calculate: CalculateFn,
): { adoptedInput: TransferTaxInput; detail: SplitCarryoverDetail } | null {
  const landCt = rawInput.landCarryoverTaxation;
  const buildingCt = rawInput.buildingCarryoverTaxation;
  if (!landCt && !buildingCt) return null;

  // ── 1. 입구 검사 — ⑫·⑧과 같은 leaf. 직접 호출 엔진도 같은 거부를 받는다(자산 단위 이월과세 상호배제·호스트·1세대1주택 포함).
  const [issue] = collectSplitPartCauseIssues(splitPartCauseFactsOfInput(rawInput));
  if (issue) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, issue.message, { field: issue.field });
  const event = rawInput.carryoverGiftEvent!; // leaf S1이 「파트 있으면 사건 필수」를 이미 보증했다

  // ── 2. 적격 판정(①·③·②1호 선언) — 사건 수준 사실이 두 파트에 같아 결과가 같다. 부적격이면 그 파트는 B 고정.
  const plans: Plans = {};
  for (const [key, ct] of [["land", landCt], ["building", buildingCt]] as const) {
    if (!ct) continue;
    const eligibility = judgeCarryoverEligibility(ct, rawInput.transferDate);
    // 3. 증여자 자본적지출(§97의2①2호) — 양도일 2024.1.1. 전은 0
    const guard = rawInput.transferDate < DONOR_CAPEX_EFFECTIVE_DATE;
    plans[key] = {
      key,
      ct,
      eligibility,
      donorCapex: guard ? 0 : ct.donorCapitalExpenditure ?? 0,
      donorCapexGuardApplied: guard,
      giftTaxCap: 0,
      giftTaxAdded: 0,
      giftTaxLimitApplied: false,
    };
  }

  // ── 4. 증여세 상당액 한도 = 그 파트의 양도차익(증여세 산입 前, 증여자 자본적지출 반영). 상대 파트의 배정과 무관하다(양도가액·취득가액이 파트별).
  for (const plan of Object.values(plans)) {
    if (!plan.eligibility.isEligible) continue;
    const probe = buildScenarioInput(
      rawInput,
      plans,
      { land: plan.key === "land" ? "A" : "B", building: plan.key === "building" ? "A" : "B" },
      NONE,
    );
    const gain = calcSplitGain(probe)?.[plan.key].gain ?? 0;
    plan.giftTaxCap = Math.max(0, gain);
    plan.giftTaxAdded = Math.min(plan.ct.giftTaxAmount, plan.giftTaxCap);
    plan.giftTaxLimitApplied = plan.ct.giftTaxAmount > plan.giftTaxCap;
  }
  const addedOf = { land: plans.land?.giftTaxAdded ?? 0, building: plans.building?.giftTaxAdded ?? 0 };

  // ── 5. ②3호 — 적격 파트의 순차 고정점. 부적격 파트는 B 고정.
  const sideOfAssignment = (ov: CarryoverScenarioOverrides): Record<PartKey, Side> => ({
    land: plans.land?.eligibility.isEligible ? ov[INDEX.land] ?? "A" : "B",
    building: plans.building?.eligibility.isEligible ? ov[INDEX.building] ?? "A" : "B",
  });
  const inputOf = (ov: CarryoverScenarioOverrides) => buildScenarioInput(rawInput, plans, sideOfAssignment(ov), addedOf);
  const memo = new Map<string, number>();
  const determinedTaxOf = (ov: CarryoverScenarioOverrides): number => {
    const key = JSON.stringify(ov);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const result = calculate(inputOf(ov), rates);
    // 안전망 — 입구의 1세대1주택 게이트(S9)는 입력 술어다. 판정 엔진이 어느 시나리오에서든 비과세로 읽으면(술어가 갈릴 때) 같은 이유로 막는다.
    if (result.isExempt === true || result.isPartialExempt === true)
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, PART_CARRYOVER_ONE_HOUSE_MESSAGE, { field: "isOneHousehold" });
    memo.set(key, result.determinedTax);
    return result.determinedTax;
  };
  const eligibleIndices = (["land", "building"] as const)
    .filter((k) => plans[k]?.eligibility.isEligible)
    .map((k) => INDEX[k]);
  const { overrides, comparisons } = resolveFilingUnitCarryoverScope(eligibleIndices, determinedTaxOf);

  // ── 6. 채택 입력 + echo
  const finalSide = sideOfAssignment(overrides);
  const adoptedInput = inputOf(overrides);
  const echoOf = (key: PartKey): SplitPartCarryoverEcho | undefined => {
    const plan = plans[key];
    if (!plan) return undefined;
    const applied = finalSide[key] === "A";
    const comparison = comparisons.get(INDEX[key]);
    return {
      judgment: applied ? "applied" : "excluded",
      ...(applied
        ? {}
        : { exclusionReason: plan.eligibility.isEligible ? ("tax_comparison" as const) : plan.eligibility.exclusionReason }),
      donorAcquisitionDate: dayKey(plan.ct.donorAcquisitionDate)!,
      donorAcquisitionPrice: plan.ct.donorAcquisitionPrice ?? 0,
      donorCapexAdded: applied ? plan.donorCapex : 0,
      donorCapexGuardApplied: plan.donorCapexGuardApplied,
      giftDateValuation: plan.ct.giftDateValuation,
      giftTaxApportioned: plan.ct.giftTaxAmount,
      giftTaxLimitCap: plan.giftTaxCap,
      giftTaxAddedToExpense: applied ? plan.giftTaxAdded : 0,
      giftTaxLimitApplied: applied && plan.giftTaxLimitApplied,
      ...(comparison ? { comparison } : {}),
    };
  };
  const period = (plans.land ?? plans.building)!.eligibility.applicablePeriodYears;
  const detail: SplitCarryoverDetail = {
    ...(plans.land ? { land: echoOf("land") } : {}),
    ...(plans.building ? { building: echoOf("building") } : {}),
    event: {
      giftRegistryDate: dayKey(event.giftRegistryDate)!,
      giftTaxCalculated: event.giftTaxCalculated,
      giftTaxBase: event.giftTaxBase,
      applicablePeriodYears: period,
    },
  };
  return { adoptedInput, detail };
}

/**
 * 해결자 echo를 `calcSplitGain`이 돌려준 `splitDetail`에 부착한다 — 입력에 숨은 필드를 싣지 않는다(결과 조립 경로 전부가 같은 변수를 쓴다).
 *
 * A 파트의 취득원인·세율 기산 규칙은 교정한다: 치환 입력이 만든 값은 `purchase`/`own`이지만 실제로는 §97의2① 이월과세(증여자 기산)다.
 * 기산일 날짜(`rateBasisAcquisitionDate`·`appliedRateBasisDate`)는 **세율 판정이 실제로 쓴 값**을 그대로 둔다 — 주택 토지 파트는
 * `max(토지, 건물 취득일)`이라 증여자 날짜와 다를 수 있다(교정하면 echo가 판정과 어긋난다).
 * B(배제) 파트는 치환 값을 그대로 둔다(`gift` 계열 없음 — `buildInputB` 규약).
 */
export function attachSplitCarryoverEcho(
  splitDetail: SplitGainResult | undefined,
  detail: SplitCarryoverDetail | undefined,
): SplitGainResult | undefined {
  if (!splitDetail || !detail) return splitDetail;
  const withEcho = (part: SplitPartResult, echo: SplitPartCarryoverEcho | undefined): SplitPartResult =>
    !echo
      ? part
      : {
          ...part,
          carryover: echo,
          ...(echo.judgment === "applied" ? { acquisitionCause: "carryover_gift" as const, rateBasisRule: "donor" as const } : {}),
        };
  return {
    ...splitDetail,
    land: withEcho(splitDetail.land, detail.land),
    building: withEcho(splitDetail.building, detail.building),
    carryoverEvent: detail.event,
  };
}

/** 계산 단계(`steps`) 한 줄 — 파트별 판정 요약 */
export function splitCarryoverStepLines(detail: SplitCarryoverDetail): { label: string; formula: string; legalBasis: string }[] {
  const lines: { label: string; formula: string; legalBasis: string }[] = [];
  for (const [key, noun] of [["land", "토지"], ["building", "건물"]] as const) {
    const e = detail[key];
    if (!e) continue;
    const formula = e.judgment === "applied"
      ? e.comparison
        ? `${noun} 이월과세 적용 — 결정세액 ${e.comparison.determinedTaxWithCarryover.toLocaleString()} vs 미적용 ${e.comparison.determinedTaxWithout.toLocaleString()}`
        : `${noun} 이월과세 적용`
      : e.exclusionReason === "tax_comparison" && e.comparison
        ? `${noun} 이월과세 미적용 — 적용 ${e.comparison.determinedTaxWithCarryover.toLocaleString()} < 미적용 ${e.comparison.determinedTaxWithout.toLocaleString()} (②3호)`
        : `${noun} 이월과세 미적용 (사유: ${carryoverExclusionReasonLabel(e.exclusionReason as Parameters<typeof carryoverExclusionReasonLabel>[0])})`;
    lines.push({ label: `${noun} 파트 이월과세 판정`, formula, legalBasis: TRANSFER.CARRYOVER_COMPARISON });
  }
  return lines;
}
