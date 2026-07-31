/**
 * 토지·건물 파트별 세율 + §104⑤ 미니 비교과세 (G-1) — STEP 7 산출세액 결정.
 *
 * 계획서 `docs/02-design/features/transfer-split-part-rate-shortterm.plan.md` §5.1.
 *
 * ## 문제
 * 토지와 건물의 취득일이 다른 split 자산(`splitDetail`)에서, 현행 세율 판정은 자산 단위
 * 단일 기산일(`transfer-tax-rate-calc.ts` `rateBasisAcquisitionDate` — split에서는 **건물
 * 취득일**)만 본다. 토지를 16년 보유하고 건물을 1년 전에 신축한 자산에 건물 기준 단기세율이
 * 토지분 과세표준까지 덮어(과대), 반대 방향에서는 토지 단기분에 누진을 적용한다(과소).
 *
 * ## 법령 근거
 * - 「소득세법」 제104조 제5항 — 과세기간에 §94①1호 자산을 **둘 이상 양도**한 경우
 *   ⓐ 1호: 합산 과세표준에 §55① 누진세율 / ⓑ 2호: 자산별 산출세액의 합 → **큰 것**.
 *   토지와 건물은 §94①1호가 병렬 열거하는 **각각의 자산**이다.
 * - 「소득세법」 제104조 제2항 — 보유기간은 **해당 자산의** 취득일부터 양도일까지.
 * - 「소득세법」 제103조 제2항 — 기본공제는 세액 감소가 가장 큰 자산에 배분
 *   (`allocateBasicDeduction`의 "MAX_BENEFIT" 전략과 동일 소스).
 *
 * ## 적용 범위
 * - **비주택**(상가·일반건물): 토지·건물 각자의 취득일로 파트별 세율 (G-1).
 * - **주택**: §104①2호 괄호("주택… 이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다.
 *   이하 이 항에서 같다")에 따라 **일체과세**이고, 조심 2024인3140(2024.9.3. 기각)이
 *   "토지·건물은 별개 과세대상이므로 세율도 구분"이라는 주장을 배척했다. 다만 그 일체과세의
 *   기산일은 "**주택부수토지로서의** 보유기간"이므로 토지를 **나중에** 취득했다면 토지 취득일이다
 *   ⇒ `resolveAppurtenantLandRateBasisDate`의 `max` 규칙 (G-3, 계획서 §5.4).
 *   토지를 먼저 취득한 경우 `max`는 주택 취득일을 돌려주어 **현행과 동일**하다(회귀 0).
 *
 * ## 비과세 축 (G-3)
 * 나중 취득 부수토지가 보유 2년 미만이면 영 §154① 보유요건을 못 채워 1세대1주택 비과세
 * 대상이 아니다 → `isLaterAcquiredLandExemptExcluded` + `applyLaterLandExemptExclusion`.
 * 비과세 판정 함수(`checkExemption`)는 자산 단위라 손대지 않고, **겸용주택 정본 패턴**대로
 * 12억 안분 대상에서 그 토지분을 빼는 방식으로 처리한다
 * (`transfer-tax-mixed-use-helpers.ts` `buildHousingPart` ①→②).
 */
import { calculateProgressiveTax, calculateHoldingPeriod } from "./tax-utils";
import { round2 } from "./area-utils";
import { appurtenantLandMultiplier } from "./appurtenant-land-rate";
import { TRANSFER } from "./legal-codes";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcTax, computeBracketBreakdown, PROGRESSIVE_RATE_CLAUSES } from "./transfer-tax-rate-calc";
import { allocateBasicDeduction } from "./transfer-tax-aggregate-helpers";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { RateGroup } from "./types/transfer-aggregate.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/** 파트 1건의 산출 결과 */
export interface SplitRatePart {
  /** 토지(배율 내 부수토지 포함) / 건물 / 배율 초과분(비사업용 토지) */
  kind: "land" | "building" | "non_business_land";
  /** §104② 세율 보유기간 기산일 */
  basisDate: Date;
  /** 파트 양도소득금액 (양도차익 − 장기보유특별공제) */
  income: number;
  /** 배분받은 기본공제 */
  allocatedBasicDeduction: number;
  /** 파트 과세표준 */
  taxBase: number;
  /** 파트 산출세액 */
  calculatedTax: number;
  appliedRate: number;
  /** 이 파트에 붙은 중과 유형·가산율 (비사업용 토지 등) — 결과 표시용 echo */
  surchargeType?: string;
  surchargeRate?: number;
  /** 부칙 제9270호 §14① 2008 위기 취득 중과배제 echo */
  nblSurchargeExcluded?: boolean;
}

export interface SplitPartRateResult {
  /** 토지 · 건물 (+ 배율 초과 비사업용 토지) — §104⑤ 후단이 각각을 별개 자산으로 본다 */
  parts: SplitRatePart[];
  /** §104⑤2호 — 자산별 산출세액의 합 */
  perAssetTotal: number;
  /** §104⑤1호 — 합산 과세표준 누진세액 */
  aggregateProgressive: number;
  chosen: "per_asset" | "aggregate";
}

export interface SplitPartRateContext {
  /** 자산 단위 과세표준 (STEP 6) */
  taxBase: number;
  /** 자산 단위 양도소득금액 (STEP 4.5/4.6) */
  transferIncome: number;
  basicDeduction: number;
  /** 토지·건물 분리 계산 결과 — 없으면 파트별 세율 자체가 성립하지 않는다 */
  splitDetail: SplitGainResult | undefined;
  parsedRates: ParsedRates;
  /** STEP 7이 만든 세율 판정 입력 (특칙 플래그 반영 후) */
  taxRateInput: TransferTaxInput;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
}

/**
 * `allocateBasicDeduction`에 넘길 세율군.
 *
 * 이 함수가 다루는 두 파트는 **같은 자산·같은 납세자**이므로 세율군 우선순위(다건 엔진이
 * 자산 간 순서를 정하려고 두는 장치)는 의미가 없다. 배분 이득은 **한계세율**이 결정하고
 * (기본공제 2,500,000 × 한계세율 = 절감액), 그 값은 `calcTax`가 낸 `appliedRate`가 정확히
 * 담고 있다. ⇒ 두 파트를 같은 군으로 두어 헬퍼가 `rate` 내림차순으로 결정하게 한다.
 * (보유월수를 여기서 다시 세면 `calcTax`의 §104② 기산 로직과 이중 진실이 된다.)
 */
const PART_RATE_GROUP: RateGroup = "progressive";

/** 「소득세법」 시행령 제154조 제1항 1세대1주택 보유요건 (2년) */
const ONE_HOUSE_HOLDING_MONTHS = 24;

/**
 * 토지 파트의 §104② 세율 보유기간 기산일.
 *
 * - **비주택**: 토지 취득일 그대로.
 * - **주택**(계획서 §5.4 G-3): **`max(토지 취득일, 주택 취득일)`**.
 *   §104①2호 괄호의 "주택… 이에 딸린 토지"는 **주택부수토지로서의** 보유기간을 뜻하므로,
 *   토지를 먼저 샀으면 주택 취득일(= 현행 동작 · 조심 2024인3140 정합), 토지를 나중에 샀으면
 *   토지 취득일이 기산일이 된다. `max` 하나가 양방향을 모두 설명한다.
 *   근거 수준은 **간접**이다 — 국세청 상속증여세과-466(2013.8.12.)·부동산거래관리과-435(2010.3.22.)가
 *   부수토지의 **취득시기를 개별 판정**하도록 한 데서 논리적으로 이어진 것이고, "세율 보유기간을
 *   `max`로" 라는 명시 판단은 없다(계획서 §10-1). ⇒ 되돌릴 수 있도록 이 함수 하나에 격리한다.
 */
export function resolveAppurtenantLandRateBasisDate(input: TransferTaxInput): Date | undefined {
  const effective = resolveLandStatutoryAcquisitionDate(input);
  if (!effective) return undefined;
  // ② 주택은 "주택부수토지로서의" 보유기간 → `max`
  if (input.propertyType !== "housing") return effective;
  return effective.getTime() >= input.acquisitionDate.getTime() ? effective : input.acquisitionDate;
}

/**
 * 토지 파트의 §104② 보유기간 기산일 — **주택 `max` 적용 전**의 법정 취득일.
 *
 * 「소득세법」 제104조 제2항 단서를 **토지 파트 고유의 취득원인**으로 적용한다(G-4).
 *   1호 상속 → 피상속인이 그 자산을 취득한 날
 *   2호 §97의2① 이월과세 → 증여자가 그 자산을 취득한 날
 * 토지 취득원인(`landAcquisitionCause`)이 명시되면 그 원인·날짜만 쓰고, 없으면 자산 단위
 * 값을 그대로 상속한다(회귀 0 — 종전에는 `calcTax`가 자산 단위 값으로 덮어썼다).
 */
export function resolveLandStatutoryAcquisitionDate(input: TransferTaxInput): Date | undefined {
  const land = input.landAcquisitionDate;
  if (!land) return undefined;
  const useLandCause = input.landAcquisitionCause !== undefined;
  const cause = useLandCause ? input.landAcquisitionCause : input.acquisitionCause;
  const decedent = useLandCause ? input.landDecedentAcquisitionDate : input.decedentAcquisitionDate;
  const donor = useLandCause ? input.landDonorAcquisitionDate : input.donorAcquisitionDate;
  if (cause === "inheritance" && decedent) return decedent;
  if ((cause === "gift" || cause === "carryover_gift") && donor) return donor;
  return land;
}

/**
 * 토지 파트 세율 판정용 입력 — 기산일을 확정한 뒤 **자산 단위 §104② 재적용을 무력화**한다.
 * `calcTax`의 `rateBasisAcquisitionDate`는 `acquisitionCause`가 상속·증여면 `acquisitionDate`를
 * 무시하고 피상속인·증여자 취득일로 덮어쓰므로, 여기서 이미 통산을 마친 날짜가 무시된다.
 */
function buildLandRateInput(input: TransferTaxInput, basisDate: Date): TransferTaxInput {
  return {
    ...input,
    acquisitionDate: basisDate,
    acquisitionCause: "purchase",
    decedentAcquisitionDate: undefined,
    donorAcquisitionDate: undefined,
  };
}

/**
 * G-3 비과세 축 — 주택 부수토지를 **나중에** 취득해 보유 2년 미만이면 그 토지분은
 * 1세대1주택 비과세를 적용하지 않는다(「소득세법」 시행령 제154조 제1항 보유요건 미충족).
 * 건물분과 2년 이상 보유한 토지분만 비과세 대상이다(계획서 §5.4).
 *
 * `splitDetail` 없이 **입력만으로** 판정한다 — 전액 비과세 조기 반환(STEP 1a)을 막을지
 * 결정하는 시점에는 아직 양도차익이 계산되지 않았기 때문이다.
 */
export function isLaterAcquiredLandExemptExcluded(input: TransferTaxInput): boolean {
  if (input.propertyType !== "housing") return false;
  if ((input.selfOwns ?? "both") !== "both") return false;
  // 별개취득 입력이어야 `calcSplitGain`이 반드시 파트를 낸다(총액 경로로 흘러 null이 되지 않음).
  if (input.isSeparateAcquisition !== true) return false;
  const land = input.landAcquisitionDate;
  if (!land) return false;
  if (land.getTime() <= input.acquisitionDate.getTime()) return false;
  // 지분(총양도가) · 부담부증여(§159)는 12억 안분 분모가 자산 단위와 달라 파트별 안분 기준이
  // 확정돼 있지 않다 — 대상에서 제외한다(계획서 §5.4 선결 과제).
  if (input.totalPropertyTransferPrice !== undefined) return false;
  if (input.burdenedGiftDenominator !== undefined) return false;
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return false;
  const held = calculateHoldingPeriod(land, input.transferDate);
  return held.years * 12 + held.months < ONE_HOUSE_HOLDING_MONTHS;
}

/** 주택 부수토지 배율 한도 판정 결과 (G-2) */
export interface AppurtenantLandExcess {
  /** 적용 배율 (3/5/10) */
  multiplier: number;
  /** 인정 한도 면적 = 정착면적 × 배율 */
  limitArea: number;
  /** 한도 초과 면적 */
  excessArea: number;
  /** 토지 양도차익 중 비사업용으로 이전할 비율 */
  nonBizRatio: number;
}

/**
 * 주택 부수토지 배율 한도 판정 — 초과분이 없으면 `null`.
 *
 * 배율 수치는 「소득세법」 시행령 제168조의12(비사업용 토지 축)와 제167조의5(세율 축)가
 * **동일**하다(3/5/5/10, 2022.1.1. 전 양도분은 도시지역 일률 5배). 입력 필드가
 * `appurtenantLandZone`이므로 그 축의 헬퍼(`appurtenantLandMultiplier`)를 그대로 쓰되,
 * **여기서의 근거 조문은 비사업용 토지 축인 시행령 제168조의12**다(§1.1.1 「축을 섞지 말 것」).
 *
 * ⚠️ 용도지역(`appurtenantLandZone`) 미입력 시 진입하지 않는다 — 미입력 fallback은 가장 작은
 * 한도(3배)를 돌려주어 초과면적을 과다 산출하고 **납세자에게 불리**해진다(계획서 R-7).
 * 미입력은 ⑧validate가 차단한다.
 */
export function resolveAppurtenantLandExcess(
  input: TransferTaxInput,
): AppurtenantLandExcess | null {
  if (input.propertyType !== "housing") return null;
  if ((input.selfOwns ?? "both") !== "both") return null;
  if (input.isSeparateAcquisition !== true) return null;
  if (input.appurtenantLandZone === undefined) return null;
  const footprint = input.buildingFootprintArea ?? 0;
  const landArea = input.acquisitionArea ?? 0;
  if (footprint <= 0 || landArea <= 0) return null;

  const multiplier = appurtenantLandMultiplier(input.appurtenantLandZone, input.transferDate);
  const limitArea = round2(footprint * multiplier);
  const excessArea = round2(Math.max(0, landArea - limitArea));
  if (excessArea <= 0) return null;
  return { multiplier, limitArea, excessArea, nonBizRatio: excessArea / landArea };
}

/** `applyHousingLandExclusions` 결과 */
export interface HousingLandExclusionResult {
  /** 배율 초과분(비사업용 토지) 양도차익 — 12억 안분 대상 아님 */
  nonBusinessGain: number;
  /** 배율 내 토지분 과세 양도차익 */
  landTaxableGain: number;
  /** 건물분의 12억 안분 후 과세 양도차익 */
  buildingTaxableGain: number;
  /** 자산 과세 양도차익 = 위 셋의 합 (Σ파트 = 자산 불변식) */
  taxableGain: number;
  step: CalculationStep;
}

/**
 * 주택 부수토지 중 **1세대1주택 비과세 대상이 아닌 부분**을 분리한다 (G-2 + G-3).
 *
 * 겸용주택 정본(`buildHousingPart`)의 ①→② 순서를 그대로 따른다:
 *   ① 비과세 비대상분을 **안분 전** 양도차익에서 분리 — 전액 과세
 *      · G-2: 배율 초과분 → 비사업용 토지(§104의3①5호). 별도 파트로 조립한다.
 *      · G-3: 배율 내이지만 나중 취득으로 보유 2년 미만인 토지분(영 §154① 보유요건 미충족).
 *   ② 12억 안분(영 §160①)은 **잔여 주택분**(배율 내 + 2년 이상 토지 + 건물)에만 적용.
 *      분모는 자산 양도가액 그대로다 — 고가주택 판정(§89①3호)은 주택과 그 부수토지 전체의
 *      실지거래가액 기준이기 때문이다.
 *
 * 파트별 과세 양도차익을 `splitDetail`에 역기입해 `calcLongTermHoldingDeduction`이 같은 값으로
 * 장특공제를 산정하게 한다(이중 안분 방지).
 *
 * 적용 대상이 아니면 `null` — 호출부는 기존 안분 경로를 그대로 쓴다.
 */
export function applyHousingLandExclusions(args: {
  input: TransferTaxInput;
  splitDetail: SplitGainResult | undefined;
  isExempt: boolean;
  isPartialExempt: boolean;
  /** `calcOneHouseProration` — 12억 안분(영 §160①) 단일 소스 */
  prorate: (gain: number) => number;
}): HousingLandExclusionResult | null {
  const { input, splitDetail, isExempt, isPartialExempt, prorate } = args;
  if (!splitDetail) return null;
  const excess = resolveAppurtenantLandExcess(input);
  const laterLand = isLaterAcquiredLandExemptExcluded(input);
  if (!excess && !laterLand) return null;

  const landGain = Math.max(0, splitDetail.land.gain);
  const buildingGain = Math.max(0, splitDetail.building.gain);

  // ① 배율 초과분을 비사업용 토지로 이전 (12억 안분 대상 아님)
  const nonBusinessGain = excess ? Math.floor(landGain * excess.nonBizRatio) : 0;
  const housingLandGain = landGain - nonBusinessGain;

  // ② 잔여 주택분 — 비과세 대상이면 안분(전액 비과세면 0), 아니면 전액 과세
  const exemptApplies = isExempt || isPartialExempt;
  const applyExempt = (gain: number) => (isExempt ? 0 : prorate(gain));
  //   배율 내 토지분: G-3(보유 2년 미만)이면 비과세 대상이 아니라 전액 과세
  const landTaxableGain =
    !exemptApplies || laterLand ? housingLandGain : applyExempt(housingLandGain);
  const buildingTaxableGain = !exemptApplies ? buildingGain : applyExempt(buildingGain);

  splitDetail.land.taxableGainAfterProration = landTaxableGain;
  splitDetail.building.taxableGainAfterProration = buildingTaxableGain;
  if (excess) {
    splitDetail.nonBusinessLandPart = {
      limitArea: excess.limitArea,
      excessArea: excess.excessArea,
      appliedMultiplier: excess.multiplier,
      gain: nonBusinessGain,
      taxableGainAfterProration: nonBusinessGain,
      holdingYears: splitDetail.land.holdingYears,
      longTermRate: 0, // `calcLongTermHoldingDeduction`이 표1로 채운다
      longTermDeduction: 0,
    };
  }

  const reasons: string[] = [];
  if (excess) {
    reasons.push(
      `배율 초과분 ${excess.excessArea.toFixed(2)}㎡(한도 정착면적 × ${excess.multiplier}배 = ` +
        `${excess.limitArea.toFixed(2)}㎡)는 「소득세법」 제104조의3 제1항 제5호의 비사업용 토지 — ` +
        `양도차익 ${nonBusinessGain.toLocaleString()}을 분리해 전액 과세`,
    );
  }
  if (laterLand) {
    const held = calculateHoldingPeriod(input.landAcquisitionDate!, input.transferDate);
    reasons.push(
      `주택 취득 후 취득한 부수토지(보유 ${held.years}년 ${held.months}개월)는 「소득세법」 ` +
        `시행령 제154조 제1항 보유요건 미충족으로 1세대1주택 비과세 대상이 아님 — ` +
        `양도차익 ${housingLandGain.toLocaleString()}을 12억 안분 없이 전액 과세`,
    );
  }
  const taxableGain = nonBusinessGain + landTaxableGain + buildingTaxableGain;
  return {
    nonBusinessGain,
    landTaxableGain,
    buildingTaxableGain,
    taxableGain,
    step: {
      label: "부수토지 비과세 제외",
      formula: `${reasons.join(" / ")} · 건물분 과세 양도차익 ${buildingTaxableGain.toLocaleString()}`,
      amount: taxableGain,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    },
  };
}

/** STEP 1a 전액 비과세 조기 반환을 억제해야 하는가 (G-2 또는 G-3) */
export function hasHousingLandExemptExclusion(input: TransferTaxInput): boolean {
  return isLaterAcquiredLandExemptExcluded(input) || resolveAppurtenantLandExcess(input) !== null;
}

/**
 * 파트별 세율 적용 여부 판정 + §104⑤ 비교과세.
 * 게이트를 하나라도 통과하지 못하면 `null` — 호출부는 기존 자산 단위 경로를 유지한다(회귀 0).
 */
export function computeSplitPartTax(ctx: SplitPartRateContext): SplitPartRateResult | null {
  const { splitDetail, taxRateInput: input, parsedRates, taxBase, transferIncome, basicDeduction } = ctx;

  // ── 게이트 ──────────────────────────────────────────────
  // 0. 토지·건물 분리 계산 결과가 있어야 한다.
  if (!splitDetail) return null;
  // 1. 토지 기산일이 있어야 파트별 판정이 성립한다.
  //    주택은 `max(토지, 주택)` — 토지를 먼저 샀으면 주택 취득일이 되어 건물 파트와 같아지고,
  //    아래 게이트 8(세율 동일)이 진입을 막는다 ⇒ 조심 2024인3140 정합·회귀 0.
  const landBasisDate = resolveAppurtenantLandRateBasisDate(input);
  if (!landBasisDate) return null;
  // 2. 소유자 분리 자산은 이미 단독 파트만 신고한다(`transfer-tax.ts` selfOwns 분기).
  if ((input.selfOwns ?? "both") !== "both") return null;
  // 3. 세율 강제 특칙 — 조특법 §98①1호 20% 단일 / P3 특칙(단기세율 배제)은 파트 무관.
  if (input.forceFlatRate20 || input.suppressShortTermRate) return null;
  // 4. 부담부증여는 §159 안분이 총액을 override한다(`transfer-tax-api-split.ts`와 동일 사유).
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return null;

  // ── 파트 구성 ───────────────────────────────────────────
  // 파트 양도소득금액은 자산 단위와 같은 소스(splitDetail)에서 만든다.
  // ⚠️ `gain`은 12억 안분 **전** 값이라 `longTermDeduction`(안분 후 기준)과 축이 다르다 —
  //    `taxableGainAfterProration`(안분·비과세 제외 반영)을 써야 파트 소득금액이 자산 단위와 맞는다.
  const nbPart = splitDetail.nonBusinessLandPart;
  // 배율 초과분은 주택부수토지가 아니므로 `max` 없이 토지 자체의 §104② 기산일을 쓴다.
  const nbBasisDate = resolveLandStatutoryAcquisitionDate(input);
  const seeds: {
    kind: SplitRatePart["kind"];
    basisDate: Date;
    raw: number;
    rateInput: TransferTaxInput;
  }[] = [
    {
      kind: "land",
      basisDate: landBasisDate,
      raw:
        (splitDetail.land.taxableGainAfterProration ?? splitDetail.land.gain) -
        splitDetail.land.longTermDeduction,
      // 배율 초과분을 이미 비사업용 토지로 떼어냈다면(G-2) 남은 배율 내 부수토지는
      // 「소득세법」 제104조의3 제1항 제5호가 비사업용으로 규정한 부분이 아니다 → 중과 제외.
      rateInput: {
        ...buildLandRateInput(input, landBasisDate),
        ...(splitDetail.nonBusinessLandPart ? { isNonBusinessLand: false } : {}),
      },
    },
    {
      kind: "building",
      basisDate: input.acquisitionDate,
      raw:
        (splitDetail.building.taxableGainAfterProration ?? splitDetail.building.gain) -
        splitDetail.building.longTermDeduction,
      // **건물은 비사업용 「토지」가 될 수 없다** — §104의3①은 토지만 규정한다.
      // 자산 단위 `isNonBusinessLand`가 건물분 과세표준까지 +10%p를 물리던 것을 여기서 끊는다
      // (§104⑤ 후단 — 각각을 별개의 자산으로 보아 산출세액을 계산). 계획서 §6 M-12.
      rateInput: {
        ...input,
        isNonBusinessLand: false,
        nonBusinessLandAreaRatio: undefined,
      },
    },
  ];
  if (nbPart && nbBasisDate) {
    seeds.push({
      kind: "non_business_land",
      // 배율 초과분은 주택부수토지가 아니므로 §104②의 "해당 자산"은 토지 본래 취득일이다.
      basisDate: nbBasisDate,
      raw: (nbPart.taxableGainAfterProration ?? nbPart.gain) - nbPart.longTermDeduction,
      // 주택 단기세율(§104①2·3호)이 아니라 §104①8호 누진 + 10%p. `propertyType`을 토지로 두어야
      // `calcTax`의 주택 분기(70%/60%)에 걸리지 않는다.
      rateInput: {
        ...buildLandRateInput(input, nbBasisDate),
        propertyType: "land",
        isNonBusinessLand: true,
        // 자산 단위 면적안분 비율은 이 파트에 의미가 없다(이미 초과분만 떼어냈다).
        nonBusinessLandAreaRatio: undefined,
      },
    });
  }

  // 6. 어느 파트든 결손이면 자산 내부에서 이미 통산된 뒤다(`transfer-tax-helpers.ts` 합산).
  //    파트별로 쪼개면 Σ파트 ≠ 자산 과세표준이 되므로 진입하지 않는다.
  if (seeds.some((s) => s.raw < 0)) return null;
  const rawSum = seeds.reduce((s, p) => s + p.raw, 0);
  if (rawSum <= 0) return null;

  // 자산 단위 양도소득금액과 어긋나면(감면 등) 비율 안분 후 잔액은 **마지막 파트가 흡수**한다.
  // 큰 금액의 곱(최대 1e18)이 2^53을 넘길 수 있어 BigInt로 계산한다.
  let allocatedIncome = 0;
  const incomes = seeds.map((s, i) => {
    if (i === seeds.length - 1) return transferIncome - allocatedIncome;
    const v =
      transferIncome === rawSum
        ? s.raw
        : Number((BigInt(transferIncome) * BigInt(s.raw)) / BigInt(rawSum));
    allocatedIncome += v;
    return v;
  });
  if (incomes.some((v) => v < 0)) return null;

  // 1차: 기본공제 배분 전 세율 확인 (§103② MAX_BENEFIT 판정에 적용세율이 필요하다)
  const preRates = seeds.map((s, i) =>
    calcTax(incomes[i], parsedRates, s.rateInput, ctx.multiHouseSurchargeResult),
  );

  // 7. 파트별 확정세율이 모두 같으면 분해해도 결과가 같다 — 진입하지 않는다(회귀 0의 핵심).
  //    세율**군**이 아니라 **확정세율 + 누진공제쌍**으로 판정한다. 1년 미만 50% + 1~2년 40%는
  //    둘 다 short_term 군이라 군 단위로 보면 누락된다.
  const uniform = preRates.every(
    (r) =>
      r.appliedRate === preRates[0].appliedRate &&
      r.progressiveDeduction === preRates[0].progressiveDeduction,
  );
  if (uniform) return null;

  // ── §104⑤ 비교과세 ─────────────────────────────────────
  const allocation = allocateBasicDeduction(
    seeds.map((_, i) => ({
      idx: i,
      rateGroup: PART_RATE_GROUP,
      income: incomes[i],
      transferDate: input.transferDate,
      rate: preRates[i].appliedRate,
    })),
    basicDeduction,
    "MAX_BENEFIT",
  );
  const allocated = seeds.map((_, i) => allocation.find((a) => a.idx === i)?.amount ?? 0);
  const taxBases = seeds.map((_, i) => Math.max(0, incomes[i] - allocated[i]));
  // 불변식 — 조용한 오답 방지. 배분액이 파트 소득금액을 넘지 않으므로 성립해야 한다.
  if (taxBases.reduce((s, v) => s + v, 0) !== taxBase) return null;

  const finals = seeds.map((s, i) =>
    calcTax(taxBases[i], parsedRates, s.rateInput, ctx.multiHouseSurchargeResult),
  );

  // ── §104⑤2호 **단서** — 동일 호 파트는 과세표준을 **합산**해 1회 계산한다 ────────
  // "둘 이상의 자산에 대하여 … 동일한 호의 세율이 적용되고, 그 적용세율이 둘 이상인 경우
  //  해당 자산에 대해서는 각 자산의 양도소득과세표준을 합산한 것에 대하여 … 호별 세율을 적용"
  // 파트별로 따로 계산하면 **누진공제를 파트 수만큼 중복**해 2호가 과소해진다.
  //
  // 정본 `transfer-tax-aggregate-helpers.ts:415-446`과 **같은 규칙**을 쓴다(내부 일관성):
  //   · 누진 호(1호·8호·⑦1호·⑦3호) → 호 단위로 합산 후 1회 계산
  //   · 단일세율 호(2·3·10호)       → 세율이 같을 때만 합산(다르면 개별 — 정본 `uniformRate`)
  //   · 호 불명(undefined)          → 묶지 않는다(현행 동작 = 안전측)
  //
  // 실제로 합쳐지는 조합은 「배율내 토지 + 건물」이 같은 호일 때뿐이다 — 비사토 파트가 있으면
  // 토지 파트는 `isNonBusinessLand: false`로 강제되므로(위 seeds) 8호 묶음은 항상 단일이다.
  const clauseKey = (i: number): string => {
    const c = finals[i].rateClause;
    if (!c) return `solo-${i}`;
    return PROGRESSIVE_RATE_CLAUSES.has(c) ? c : `${c}|${finals[i].appliedRate}`;
  };
  const clauseGroups = new Map<string, number[]>();
  seeds.forEach((_, i) => {
    const k = clauseKey(i);
    clauseGroups.set(k, [...(clauseGroups.get(k) ?? []), i]);
  });

  // 묶음 세액을 파트별 표시값으로 역안분한다(잔액은 마지막 파트가 흡수) —
  // `Σ 파트 세액 === perAssetTotal` 불변식을 지켜야 결과 산식이 합계와 어긋나지 않는다
  // (memory `feedback_engine_result_display_drift` · `feedback_floor_residual_absorption`).
  const partTax = new Array<number>(seeds.length).fill(0);
  let perAssetTotal = 0;
  for (const idxs of clauseGroups.values()) {
    if (idxs.length === 1) {
      partTax[idxs[0]] = finals[idxs[0]].calculatedTax;
      perAssetTotal += partTax[idxs[0]];
      continue;
    }
    const mergedBase = idxs.reduce((s, i) => s + taxBases[i], 0);
    const mergedTax = calcTax(
      mergedBase,
      parsedRates,
      seeds[idxs[0]].rateInput,
      ctx.multiHouseSurchargeResult,
    ).calculatedTax;
    let allocatedTax = 0;
    idxs.forEach((i, n) => {
      const v =
        n === idxs.length - 1
          ? mergedTax - allocatedTax
          : mergedBase === 0
            ? 0
            : Number((BigInt(mergedTax) * BigInt(taxBases[i])) / BigInt(mergedBase));
      partTax[i] = v;
      allocatedTax += v;
    });
    perAssetTotal += mergedTax;
  }

  const parts: SplitRatePart[] = seeds.map((s, i) => ({
    kind: s.kind,
    basisDate: s.basisDate,
    income: incomes[i],
    allocatedBasicDeduction: allocated[i],
    taxBase: taxBases[i],
    calculatedTax: partTax[i],
    appliedRate: finals[i].appliedRate,
    surchargeType: finals[i].surchargeType,
    surchargeRate: finals[i].surchargeRate,
    nblSurchargeExcluded: finals[i].nblSurchargeExcluded,
  }));
  const aggregateProgressive = calculateProgressiveTax(taxBase, parsedRates.brackets);

  return {
    parts,
    perAssetTotal,
    aggregateProgressive,
    chosen: perAssetTotal >= aggregateProgressive ? "per_asset" : "aggregate",
  };
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * STEP 7 「산출세액」 계산 단계 조립 — 파트별 세율 경로에서는 `shortTermNote`가 파트별 내역을 싣는다.
 * (transfer-tax.ts 800줄 정책 — 산식 조립만 이관, 문자열·법령근거는 종전 그대로)
 */
export function buildCalculatedTaxStep(
  taxResult: ReturnType<typeof calcTax>,
  taxBase: number,
): CalculationStep {
  return {
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()} × 세율 ${pct(taxResult.appliedRate)}${taxResult.surchargeRate ? ` (+중과 ${pct(taxResult.surchargeRate)})` : ""}${taxResult.progressiveDeduction ? ` - 누진공제 ${taxResult.progressiveDeduction.toLocaleString()}` : ""}${taxResult.shortTermNote ? ` (${taxResult.shortTermNote})` : ""}`,
    amount: taxResult.calculatedTax,
    legalBasis: taxResult.surchargeRate ? TRANSFER.SURCHARGE : TRANSFER.TAX_RATE,
  };
}

/**
 * STEP 7 산출세액 — 파트별 세율이 성립하면 §104⑤ 비교과세 결과를, 아니면 기존 자산 단위 세액을 낸다.
 * 반환 형태는 `calcTax`와 동일해 호출부·finalize가 구분 없이 소비한다.
 */
export function resolveSplitAwareTax(
  ctx: SplitPartRateContext,
): ReturnType<typeof calcTax> & { splitPartDetail?: SplitPartRateResult } {
  const fallback = () =>
    calcTax(ctx.taxBase, ctx.parsedRates, ctx.taxRateInput, ctx.multiHouseSurchargeResult);
  if (!ctx.splitDetail) return fallback();

  const parts = computeSplitPartTax(ctx);
  if (!parts) return fallback();

  const chosenTax = Math.max(parts.perAssetTotal, parts.aggregateProgressive);
  if (parts.chosen === "aggregate") {
    const base = fallback();
    // 1호(합산 누진)가 이겼고 그 값이 기존 자산 단위 세액과 같으면 **아무것도 바뀌지 않는다** —
    // 장기보유 split 자산 대부분이 여기다(파트 누진구간만 다름). 산식 문구까지 종전 그대로 둔다.
    if (base.calculatedTax === chosenTax) return base;
    // 기존 경로가 자산 단위 단기세율을 전체에 물려 1호보다 크게 나온 경우 — §104⑤ 위반이므로 정정.
    const { baseRate, deduction } = computeBracketBreakdown(ctx.taxBase, ctx.parsedRates.brackets);
    return {
      calculatedTax: chosenTax,
      appliedRate: baseRate,
      progressiveDeduction: deduction,
      surchargeSuspended: false,
      shortTermNote:
        `토지·건물 파트별 세율 비교(소득세법 §104⑤): 합산 누진세액 ${chosenTax.toLocaleString()}이 ` +
        `자산별 합계 ${parts.perAssetTotal.toLocaleString()}보다 크다`,
      splitPartDetail: parts,
    };
  }
  const label: Record<SplitRatePart["kind"], string> = {
    land: "토지",
    building: "건물",
    non_business_land: "배율 초과 토지(비사업용)",
  };
  // 파트 중 하나라도 중과가 붙으면 자산 단위로도 그 사실을 노출한다 —
  // 결과 카드의 중과 표시·법령근거가 사라지지 않도록(§104①8호 비사업용 토지 등).
  const surcharged = parts.parts.find((p) => p.surchargeType !== undefined);
  return {
    calculatedTax: chosenTax,
    // 표시용 적용세율은 파트 최고세율 (누진공제는 파트별로 달라 합산 표시 불가)
    appliedRate: Math.max(...parts.parts.map((p) => p.appliedRate)),
    progressiveDeduction: 0,
    surchargeSuspended: false,
    surchargeType: surcharged?.surchargeType,
    surchargeRate: surcharged?.surchargeRate,
    ...(parts.parts.some((p) => p.nblSurchargeExcluded) ? { nblSurchargeExcluded: true } : {}),
    shortTermNote:
      `파트별 세율(소득세법 §104⑤2호): ` +
      parts.parts
        .map((p) => `${label[p.kind]} ${pct(p.appliedRate)} ${p.calculatedTax.toLocaleString()}`)
        .join(" + ") +
      ` (합산 누진세액 ${parts.aggregateProgressive.toLocaleString()}과 비교한 큰 세액)`,
    splitPartDetail: parts,
  };
}
