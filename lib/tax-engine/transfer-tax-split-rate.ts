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
import { TRANSFER } from "./legal-codes";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcTax, computeBracketBreakdown } from "./transfer-tax-rate-calc";
import { allocateBasicDeduction } from "./transfer-tax-aggregate-helpers";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { RateGroup } from "./types/transfer-aggregate.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/** 파트 1건의 산출 결과 */
export interface SplitRatePart {
  /** "land" | "building" */
  kind: "land" | "building";
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
}

export interface SplitPartRateResult {
  land: SplitRatePart;
  building: SplitRatePart;
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
  const land = input.landAcquisitionDate;
  if (!land) return undefined;
  if (input.propertyType !== "housing") return land;
  return land.getTime() >= input.acquisitionDate.getTime() ? land : input.acquisitionDate;
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

/** `applyLaterLandExemptExclusion` 결과 */
export interface LaterLandExemptExclusion {
  /** 나중 취득 토지분 과세 양도차익 — 12억 안분 없이 전액 과세 */
  landTaxableGain: number;
  /** 비과세 대상 파트(건물)의 12억 안분 후 과세 양도차익 */
  buildingTaxableGain: number;
  /** 자산 과세 양도차익 = 위 둘의 합 (Σ파트 = 자산 불변식) */
  taxableGain: number;
  step: CalculationStep;
}

/**
 * G-3 비과세 축 적용 — 나중 취득 부수토지분을 12억 안분 대상에서 빼고 전액 과세로 돌린다.
 *
 * 겸용주택 정본(`buildHousingPart`)의 ①→② 순서를 그대로 따른다:
 *   ① 비과세 비대상분(여기서는 보유 2년 미만 토지분)을 **안분 전** 양도차익에서 분리 — 전액 과세
 *   ② 12억 안분(영 §160①)은 **잔여 주택분**에만 적용. 분모는 자산 양도가액 그대로다
 *      (고가주택 판정 §89①3호는 주택과 그 부수토지 전체의 실지거래가액 기준).
 *
 * 파트별 과세 양도차익을 `splitDetail`에 역기입해 `calcLongTermHoldingDeduction`이 같은 값으로
 * 장특공제를 산정하게 한다(이중 안분 방지).
 *
 * 적용 대상이 아니면 `null` — 호출부는 기존 안분 경로를 그대로 쓴다.
 */
export function applyLaterLandExemptExclusion(args: {
  input: TransferTaxInput;
  splitDetail: SplitGainResult | undefined;
  isExempt: boolean;
  isPartialExempt: boolean;
  /** `calcOneHouseProration` — 12억 안분(영 §160①) 단일 소스 */
  prorate: (gain: number) => number;
}): LaterLandExemptExclusion | null {
  const { input, splitDetail, isExempt, isPartialExempt, prorate } = args;
  if (!splitDetail) return null;
  if (!isExempt && !isPartialExempt) return null;
  if (!isLaterAcquiredLandExemptExcluded(input)) return null;

  // ① 보유 2년 미만 토지분 — 안분 없이 전액 과세
  const landTaxableGain = Math.max(0, splitDetail.land.gain);
  // ② 잔여(건물분) — 전액 비과세이면 0, 고가주택이면 12억 안분
  const buildingGain = Math.max(0, splitDetail.building.gain);
  const buildingTaxableGain = isExempt ? 0 : prorate(buildingGain);

  splitDetail.land.taxableGainAfterProration = landTaxableGain;
  splitDetail.building.taxableGainAfterProration = buildingTaxableGain;

  const held = calculateHoldingPeriod(input.landAcquisitionDate!, input.transferDate);
  const heldLabel = `${held.years}년 ${held.months}개월`;
  return {
    landTaxableGain,
    buildingTaxableGain,
    taxableGain: landTaxableGain + buildingTaxableGain,
    step: {
      label: "부수토지 비과세 제외 (보유 2년 미만)",
      formula:
        `주택 취득 후 취득한 부수토지(보유 ${heldLabel})는 「소득세법」 시행령 제154조 제1항 ` +
        `보유요건을 충족하지 못해 1세대1주택 비과세 대상이 아니다 — ` +
        `토지분 양도차익 ${landTaxableGain.toLocaleString()}은 12억 안분 없이 전액 과세, ` +
        `건물분 과세 양도차익 ${buildingTaxableGain.toLocaleString()}`,
      amount: landTaxableGain + buildingTaxableGain,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    },
  };
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
  // 5. 비사업용 토지 자산은 §104의3 정의·기간요건과 §104⑤ 후단(한 필지 내 구분)이 얽힌다 —
  //    범위 밖(계획서 §5.3 P4 · §6 M-12). 자산 단위 판정을 그대로 유지한다.
  if (input.isNonBusinessLand) return null;

  // 파트 양도소득금액 — 자산 단위와 같은 소스(splitDetail)에서 만든다.
  // ⚠️ `gain`은 12억 안분 **전** 값이라 `longTermDeduction`(안분 후 기준)과 축이 다르다 —
  //    `taxableGainAfterProration`(안분·비과세 제외 반영)을 써야 파트 소득금액이 자산 단위와 맞는다.
  const rawLand =
    (splitDetail.land.taxableGainAfterProration ?? splitDetail.land.gain) -
    splitDetail.land.longTermDeduction;
  const rawBuilding =
    (splitDetail.building.taxableGainAfterProration ?? splitDetail.building.gain) -
    splitDetail.building.longTermDeduction;
  // 6. 어느 파트든 결손이면 자산 내부에서 이미 통산된 뒤다(`transfer-tax-helpers.ts` 합산).
  //    파트별로 쪼개면 Σ파트 ≠ 자산 과세표준이 되므로 진입하지 않는다.
  if (rawLand < 0 || rawBuilding < 0) return null;
  const rawSum = rawLand + rawBuilding;
  if (rawSum <= 0) return null;

  // 자산 단위 양도소득금액과 어긋나면(감면·안분 등) 비율 안분 후 잔액은 건물 파트가 흡수한다.
  // 큰 금액의 곱(최대 1e18)이 2^53을 넘길 수 있어 BigInt로 계산한다.
  const landIncome =
    transferIncome === rawSum
      ? rawLand
      : Number((BigInt(transferIncome) * BigInt(rawLand)) / BigInt(rawSum));
  const buildingIncome = transferIncome - landIncome;
  if (landIncome < 0 || buildingIncome < 0) return null;

  const buildingBasisDate = input.acquisitionDate;
  // 파트별 세율 판정 입력 — 토지는 기산일 교체, 건물은 자산 단위 로직 그대로.
  const landInput: TransferTaxInput = { ...input, acquisitionDate: landBasisDate };
  const buildingInput: TransferTaxInput = input;

  // 1차: 기본공제 배분 전 세율 확인 (§103② MAX_BENEFIT 판정에 적용세율이 필요하다)
  const landRate = calcTax(landIncome, parsedRates, landInput, ctx.multiHouseSurchargeResult);
  const buildingRate = calcTax(buildingIncome, parsedRates, buildingInput, ctx.multiHouseSurchargeResult);

  // 7. 파트별 확정세율이 같으면 분해해도 결과가 같다 — 진입하지 않는다(회귀 0의 핵심).
  //    세율**군**이 아니라 **확정세율 + 누진공제쌍**으로 판정한다. 1년 미만 50% + 1~2년 40%는
  //    둘 다 short_term 군이라 군 단위로 보면 누락된다.
  if (
    landRate.appliedRate === buildingRate.appliedRate &&
    landRate.progressiveDeduction === buildingRate.progressiveDeduction
  ) {
    return null;
  }

  // ── §104⑤ 비교과세 ─────────────────────────────────────
  const allocation = allocateBasicDeduction(
    [
      {
        idx: 0,
        rateGroup: PART_RATE_GROUP,
        income: landIncome,
        transferDate: input.transferDate,
        rate: landRate.appliedRate,
      },
      {
        idx: 1,
        rateGroup: PART_RATE_GROUP,
        income: buildingIncome,
        transferDate: input.transferDate,
        rate: buildingRate.appliedRate,
      },
    ],
    basicDeduction,
    "MAX_BENEFIT",
  );
  const allocatedLand = allocation.find((a) => a.idx === 0)?.amount ?? 0;
  const allocatedBuilding = allocation.find((a) => a.idx === 1)?.amount ?? 0;

  const landTaxBase = Math.max(0, landIncome - allocatedLand);
  const buildingTaxBase = Math.max(0, buildingIncome - allocatedBuilding);
  // 불변식 — 조용한 오답 방지. 배분액이 파트 소득금액을 넘지 않으므로 성립해야 한다.
  if (landTaxBase + buildingTaxBase !== taxBase) return null;

  const landFinal = calcTax(landTaxBase, parsedRates, landInput, ctx.multiHouseSurchargeResult);
  const buildingFinal = calcTax(buildingTaxBase, parsedRates, buildingInput, ctx.multiHouseSurchargeResult);

  const perAssetTotal = landFinal.calculatedTax + buildingFinal.calculatedTax;
  const aggregateProgressive = calculateProgressiveTax(taxBase, parsedRates.brackets);

  return {
    land: {
      kind: "land",
      basisDate: landBasisDate,
      income: landIncome,
      allocatedBasicDeduction: allocatedLand,
      taxBase: landTaxBase,
      calculatedTax: landFinal.calculatedTax,
      appliedRate: landFinal.appliedRate,
    },
    building: {
      kind: "building",
      basisDate: buildingBasisDate,
      income: buildingIncome,
      allocatedBasicDeduction: allocatedBuilding,
      taxBase: buildingTaxBase,
      calculatedTax: buildingFinal.calculatedTax,
      appliedRate: buildingFinal.appliedRate,
    },
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
  return {
    calculatedTax: chosenTax,
    // 표시용 적용세율은 파트 최고세율 (누진공제는 파트별로 달라 합산 표시 불가)
    appliedRate: Math.max(parts.land.appliedRate, parts.building.appliedRate),
    progressiveDeduction: 0,
    surchargeSuspended: false,
    shortTermNote:
      `토지·건물 파트별 세율(소득세법 §104⑤2호): ` +
      `토지 ${pct(parts.land.appliedRate)} ${parts.land.calculatedTax.toLocaleString()} + ` +
      `건물 ${pct(parts.building.appliedRate)} ${parts.building.calculatedTax.toLocaleString()} ` +
      `(합산 누진세액 ${parts.aggregateProgressive.toLocaleString()}과 비교한 큰 세액)`,
    splitPartDetail: parts,
  };
}
