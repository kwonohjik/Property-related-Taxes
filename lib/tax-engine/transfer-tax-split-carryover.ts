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
 * ## ②2호 — 1세대1주택과 겹칠 때 (P5, 계획서 `transfer-split-part-carryover-p5.plan.md` Q1·Q2)
 * ②3호 비교 **앞에서** 판정한다(자산 단위 `transfer-tax-carryover.ts` Step 5.5와 같은 순서). 판정 객체는 「주택(이에 딸린 토지를 포함)」 일체다 —
 * 적격 파트를 **전부 적용(AA)** 한 세계에서 §89①3호에 해당하고 **전부 미적용(BB)** 세계에서는 해당하지 않으면(상태 변화 — 사전-2016-법령해석재산-0374 ·
 * 조심-2022-서-7583) 모든 적격 파트에 ①을 적용하지 않는다. 「해당」은 **건물·토지 각각**의 비과세 해당이다(기본통칙 89-154…2 「각각 2년」 ·
 * ②2호 괄호 「이에 딸린 토지를 포함」) — 나중에 취득한 토지만 보유요건에 미달해 토지분만 과세되는 G-3도 상태로 센다. 정면 해석례는 없다(확인 필요).
 *
 * ## 증여세 상당액 (영 §163의2②)
 * 안분은 ⑭ 합성기(`composeSplitCarryover`)가 이미 했다(`ct.giftTaxAmount`, 한도 前). 한도는 「양도가액에서 §97①·②의 금액을 공제한 잔액」이고,
 * 사전-2025-법규재산-0366의 「해당 자산」에 따라 **그 파트의 양도차익**이다(자산 단위가 아니다 — 실측으로 echo가 갈린다, anchor SPCO-T4).
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { applyRate } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { carryoverExclusionReasonLabel } from "./transfer-carryover-exclusion-labels";
import { collectSplitPartCauseIssues } from "./transfer-split-part-cause";
import { dayKey, splitPartCauseFactsOfInput } from "./transfer-split-part-cause-input";
import { calcSplitGain } from "./transfer-tax-split-gain";
import { judgeCarryoverEligibility, type CarryoverEligibility } from "./transfer-tax-carryover-eligibility";
import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
  type FilingUnitCarryoverComparison,
} from "./transfer-tax-aggregate-carryover-scope";
import { DONOR_CAPEX_EFFECTIVE_DATE } from "./transfer-tax-carryover";
import { isLaterAcquiredLandExemptExcluded } from "./transfer-tax-appurtenant-land";
import { carryoverGiftHouseholdBasis } from "./one-house/gift-household-basis";
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
) => { determinedTax: number; isExempt?: boolean; isPartialExempt?: boolean; isExemptCore?: true };

/** 한 시나리오 세계의 §89①3호 해당 상태 — 건물(주택)과 딸린 토지를 **각각** 본다(P5-Q2). */
interface OneHouseState {
  house: boolean;
  land: boolean;
}

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
 *
 * **환산 파트(P6)** — 증여자 취득가액을 모르는 A 파트(`ct.useEstimatedAcquisition`)는 취득가액 칸 대신 그 파트 모드를 `estimated`로 두고, 분자(증여자 취득 당시
 * 기준시가)·증여세 상당액을 해결자 전용 `splitCarryoverBasis`에 싣는다. 증여세 상당액은 `*DirectExpenses`에 더하지 않는다 — 환산 파트의 §97②2호 단서 비교
 * (`applyAssetSwap`) 안에서 증발하거나 단서 나목에 섞이기 때문이다(`calcSplitGain`이 비교 뒤에 더한다). 증여자 자본적지출은 종전대로 `*DirectExpenses`에 더한다
 * (단서 나목 = 자본적지출 + 양도비). 실가 A 파트는 종전과 한 줄도 다르지 않다.
 */
function buildScenarioInput(
  raw: TransferTaxInput,
  plans: Plans,
  sideOf: Record<PartKey, Side>,
  addedOf: Record<PartKey, number>,
): TransferTaxInput {
  // 파트 취득원인 — 시나리오가 «그 파트가 실제로 어떻게 취득됐는가»를 말해야 영 §163⑨ 단서 1호·2호(max(평가액, 영 §164④·⑦ 가액))
  // 술어(`resolveLandPartAcquisition`·`resolveBuildingPartAcquisition`)와 장특·세율 기산이 일반 입력과 같이 돈다.
  //   · A(적용) 파트: 증여자의 **매매** 취득으로 치환했다 → `purchase`(증여자 기산은 아래 취득일 치환이 만든다).
  //   · B(미적용·배제) 파트: 수증자 본인의 **일반 증여**로 계산한다 → `gift`. 이월과세 미적용이므로 §104②2호 통산은 없다 —
  //     통산은 `carryover_gift`만이고(`transfer-rate-holding-basis.ts`) 증여자 취득일 입력이 없는 `gift`는 증여일 기산이다(anchor로 고정).
  //     `purchase`로 두면 단서 술어가 꺼져 일반 증여보다 취득가액이 작아진다(리뷰 C-2: 같은 입력 121,860,000 ↔ 67,270,000).
  //   토지가 건물 `gift`와 함께 쓰일 수 없는 결합(D3)을 피하려고: 건물 B + 토지 A → 토지 overlay `purchase`(D2), 건물 B + 토지 B(C 둘 다 B) →
  //   토지 원인 없음(같은 날 비-별개 — 일반 통째 증여와 같은 입력).
  const buildingCause = !plans.building ? raw.acquisitionCause : sideOf.building === "A" ? ("purchase" as const) : ("gift" as const);
  let landCause = raw.landAcquisitionCause;
  if (plans.land) {
    if (sideOf.land === "A") landCause = buildingCause === "gift" ? "purchase" : undefined;
    else landCause = buildingCause === "gift" ? undefined : "gift";
  }
  const next: TransferTaxInput = {
    ...raw,
    acquisitionCause: buildingCause,
    // §104②1·2호 입력은 치환 날짜로 이미 반영된다 — 남기면 세율 기산이 이중으로 읽힌다.
    landAcquisitionCause: landCause,
    landDecedentAcquisitionDate: undefined,
    landDonorAcquisitionDate: undefined,
    // 재귀 방지(R-4) — 서브객체 3키를 비운다. 이 입력은 STEP 0.476을 다시 타지 않는다.
    landCarryoverTaxation: undefined,
    buildingCarryoverTaxation: undefined,
    carryoverGiftEvent: undefined,
    // P6 — 해결자 전용 내부 입력도 비운다(외부에서 들어온 값이 B 시나리오로 새지 않게). A 환산 파트일 때만 아래에서 다시 세운다.
    splitCarryoverBasis: undefined,
    // §99의4·§98의9 「그 주택 취득 전에 보유하던」 판정은 수증자 본인 취득일이다 — 건물 A 치환이 취득순서를 앞당기지 않게 원 취득일을 고정한다.
    houseCountExclusionAcquisitionDate: raw.houseCountExclusionAcquisitionDate ?? raw.acquisitionDate,
  };
  const land = plans.land;
  if (land && sideOf.land === "A") {
    next.landAcquisitionDate = land.ct.donorAcquisitionDate;
    next.landAcquisitionPrice = land.ct.donorAcquisitionPrice ?? 0;
    if (land.ct.useEstimatedAcquisition === true) {
      next.landAcqMode = "estimated";
      next.landDirectExpenses = (raw.landDirectExpenses ?? 0) + land.donorCapex;
      next.splitCarryoverBasis = {
        ...next.splitCarryoverBasis,
        land: { stdAtAcq: land.ct.donorStandardPriceAtAcquisition, giftTaxExpense: addedOf.land },
      };
    } else {
      next.landDirectExpenses = (raw.landDirectExpenses ?? 0) + land.donorCapex + addedOf.land;
    }
  }
  const building = plans.building;
  if (building && sideOf.building === "A") {
    next.acquisitionDate = building.ct.donorAcquisitionDate;
    next.buildingAcquisitionPrice = building.ct.donorAcquisitionPrice ?? 0;
    if (building.ct.useEstimatedAcquisition === true) {
      next.buildingAcqMode = "estimated";
      next.buildingDirectExpenses = (raw.buildingDirectExpenses ?? 0) + building.donorCapex;
      next.splitCarryoverBasis = {
        ...next.splitCarryoverBasis,
        building: { stdAtAcq: building.ct.donorStandardPriceAtAcquisition, giftTaxExpense: addedOf.building },
      };
    } else {
      next.buildingDirectExpenses = (raw.buildingDirectExpenses ?? 0) + building.donorCapex + addedOf.building;
    }
  }
  // 「취득 당시」 조정대상지역·2017.8.3. 경과규정·세대 보유 통산의 기준일 — 자산 단위 시나리오와 같은 leaf(P5-Q5). 「주택」은 건물이다.
  //   A면 보유는 이미 증여자 취득일(§95④ 단서)이고 판정일은 증여일(사전-2023-법규재산-0444) · B면 증여일 기산 + 계속 같은 세대면 세대 통산(조심-2022-서-7583).
  //   없으면 건물 A가 「취득 당시」를 증여자 취득일로 읽어 거주요건을 건너뛴다(실측 191,490,000 → 0). 토지만(A)은 건물이 본인 취득이라 원 입력 그대로다.
  if (building) next.giftHouseholdBasis = carryoverGiftHouseholdBasis(building.ct, sideOf.building === "A");
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
    // P6 — 환산 입력의 분자는 양수여야 한다. 비면 환산취득가액·개산공제가 0이 되어 «취득가액 0» 양도차익이 조용히 나온다(⑫·⑧이 먼저 막는다 — 직접 호출 방어선).
    if (ct.useEstimatedAcquisition === true && !((ct.donorStandardPriceAtAcquisition ?? 0) > 0))
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `${key === "land" ? "토지" : "건물"} 파트 환산취득가액에는 증여자 취득 당시 그 파트 기준시가(양수)가 필요합니다 (${TRANSFER.CARRYOVER_DONOR_BASIS}, ${TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ})`,
        { field: key === "land" ? "landCarryoverPart" : "buildingCarryoverPart" },
      );
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
  const memo = new Map<string, { determinedTax: number; state: OneHouseState }>();
  const scenarioOf = (ov: CarryoverScenarioOverrides) => {
    const key = JSON.stringify(ov);
    const hit = memo.get(key);
    if (hit) return hit;
    const input = inputOf(ov);
    const result = calculate(input, rates);
    // §89①3호 해당 — 전액(조기반환)·고가(부분)·부수토지 제외로 정상 경로를 탄 전액 대상(`isExemptCore`). 토지는 G-3(나중 취득 토지 보유요건 미달)이면 해당하지 않는다.
    const house = result.isExempt === true || result.isPartialExempt === true || result.isExemptCore === true;
    const entry = { determinedTax: result.determinedTax, state: { house, land: house && !isLaterAcquiredLandExemptExcluded(input) } };
    memo.set(key, entry);
    return entry;
  };
  const determinedTaxOf = (ov: CarryoverScenarioOverrides): number => scenarioOf(ov).determinedTax;
  const eligibleIndices = (["land", "building"] as const)
    .filter((k) => plans[k]?.eligibility.isEligible)
    .map((k) => INDEX[k]);

  // ── 5a. ②2호 — 적격 파트 전부 적용(AA)이면 해당하고 전부 미적용(BB)이면 해당하지 않는 상태 변화. 배우자 예외는 통째 증여(C)만(P5-Q4).
  const allSide = (side: Side): CarryoverScenarioOverrides => Object.fromEntries(eligibleIndices.map((i) => [i, side]));
  const becomesOneHouse = (() => {
    if (eligibleIndices.length === 0) return false;
    const a = scenarioOf(allSide("A")).state;
    const b = scenarioOf(allSide("B")).state;
    return (a.house && !b.house) || (a.land && !b.land);
  })();
  const bct = plans.building?.ct;
  const spouseException =
    becomesOneHouse && !!plans.land && !!bct && bct.donorRelation === "spouse" && bct.spouseGiftOneHouseAtGiftDate === true;
  const oneHouseExclusion = becomesOneHouse && !spouseException;

  // ── 5b. ②3호 — ②2호가 걸리지 않았을 때만.
  const { overrides, comparisons } = oneHouseExclusion
    ? { overrides: allSide("B"), comparisons: new Map<number, FilingUnitCarryoverComparison>() }
    : resolveFilingUnitCarryoverScope(eligibleIndices, determinedTaxOf);

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
        : {
            exclusionReason: !plan.eligibility.isEligible
              ? plan.eligibility.exclusionReason
              : oneHouseExclusion
                ? ("one_house_exemption" as const)
                : ("tax_comparison" as const),
          }),
      donorAcquisitionDate: dayKey(plan.ct.donorAcquisitionDate)!,
      // P6 — 환산 입력은 가액을 받지 않는다(0으로 채우면 «취득가액 0»으로 읽힌다). 분자만 싣고, 분모·환산취득가액·개산공제는 `attachSplitCarryoverEcho`가 파트 결과에서 채운다.
      ...(plan.ct.useEstimatedAcquisition === true
        ? { estimated: { donorStdPriceAtAcquisition: plan.ct.donorStandardPriceAtAcquisition! } }
        : { donorAcquisitionPrice: plan.ct.donorAcquisitionPrice ?? 0 }),
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
  const orderDependent = !oneHouseExclusion && hasTwoStableConfigurations(plans, determinedTaxOf);
  const detail: SplitCarryoverDetail = {
    ...(plans.land ? { land: echoOf("land") } : {}),
    ...(plans.building ? { building: echoOf("building") } : {}),
    event: {
      giftRegistryDate: dayKey(event.giftRegistryDate)!,
      giftTaxCalculated: event.giftTaxCalculated,
      giftTaxBase: event.giftTaxBase,
      applicablePeriodYears: period,
      ...(orderDependent ? { orderDependent: true as const } : {}),
      ...(oneHouseExclusion ? { oneHouseExclusion: true as const } : {}),
      ...(spouseException ? { spouseOneHouseExceptionApplied: true as const } : {}),
    },
  };
  return { adoptedInput, detail };
}

/**
 * 안정 구성이 **둘 이상**인가 — 두 파트가 모두 ②3호 비교 대상일 때만 본다(한 파트면 구성이 둘뿐이라 순서가 없다).
 * 안정 구성 = 각 파트가 자기 쪽을 뒤집으면 판정이 바뀌는 지점: 적용(A) 파트는 `T(X) ≥ T(X∖p)`, 배제(B) 파트는 `T(X∪p) < T(X)` (②3호는 적용한 세액이 «적은 경우»에만 배제).
 * 4조합의 결정세액은 순차 고정점이 이미 대부분 계산해 메모에 있다 — 추가 호출은 많아야 한두 번이다. 표시 전용(`SplitCarryoverEventEcho.orderDependent`), 세액·채택은 바꾸지 않는다.
 */
function hasTwoStableConfigurations(plans: Plans, tax: (ov: CarryoverScenarioOverrides) => number): boolean {
  if (!plans.land?.eligibility.isEligible || !plans.building?.eligibility.isEligible) return false;
  const T = (land: Side, building: Side) => tax({ [INDEX.land]: land, [INDEX.building]: building });
  let stable = 0;
  for (const land of ["A", "B"] as const) {
    for (const building of ["A", "B"] as const) {
      const here = T(land, building);
      const landStable = land === "A" ? here >= T("B", building) : T("A", building) < here;
      const buildingStable = building === "A" ? here >= T(land, "B") : T(land, "A") < here;
      if (landStable && buildingStable) stable++;
    }
  }
  return stable >= 2;
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
  const withEcho = (part: SplitPartResult, rawEcho: SplitPartCarryoverEcho | undefined): SplitPartResult => {
    if (!rawEcho) return part;
    // P6 — 적용(A) 환산 파트의 분모·환산취득가액·개산공제는 엔진이 실제 쓴 파트 결과에서 읽는다(재계산 금지 — 표시 드리프트 방지).
    const echo: SplitPartCarryoverEcho =
      rawEcho.estimated && rawEcho.judgment === "applied"
        ? {
            ...rawEcho,
            estimated: {
              ...rawEcho.estimated,
              ...(part.stdPriceAtTransfer !== undefined ? { stdPriceAtTransfer: part.stdPriceAtTransfer } : {}),
              estimatedAcquisitionPrice: part.acquisitionPrice,
              ...(part.lumpDeductionBase !== undefined && part.lumpDeductionRate !== undefined
                ? { lumpDeduction: applyRate(part.lumpDeductionBase, part.lumpDeductionRate) }
                : {}),
            },
          }
        : rawEcho;
    return {
      ...part,
      carryover: echo,
      ...(echo.judgment === "applied" ? { acquisitionCause: "carryover_gift" as const, rateBasisRule: "donor" as const } : {}),
    };
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
