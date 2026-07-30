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
 * ## 적용 범위 — **비주택 전용**
 * 주택과 그 부수토지는 §104①2호 괄호("주택… 이에 딸린 토지로서 대통령령으로 정하는 토지를
 * 포함한다. 이하 이 항에서 같다")에 따라 **일체과세**이고, 조심 2024인3140(2024.9.3. 기각)이
 * "토지·건물은 별개 과세대상이므로 세율도 구분"이라는 주장을 배척했다.
 * ⇒ `propertyType === "housing"`은 진입시키지 않는다.
 * (주택 부수토지를 **나중에** 취득한 경우의 `max` 기산일은 계획서 §5.4 G-3 — 별도 단계.)
 */
import { calculateProgressiveTax } from "./tax-utils";
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
  const landBasisDate = input.landAcquisitionDate;
  if (!landBasisDate) return null;
  // 2. 주택 제외 — §104①2호 괄호 일체과세(조심 2024인3140). G-3(§5.4)에서 재검토한다.
  if (input.propertyType === "housing") return null;
  // 3. 소유자 분리 자산은 이미 단독 파트만 신고한다(`transfer-tax.ts` selfOwns 분기).
  if ((input.selfOwns ?? "both") !== "both") return null;
  // 4. 세율 강제 특칙 — 조특법 §98①1호 20% 단일 / P3 특칙(단기세율 배제)은 파트 무관.
  if (input.forceFlatRate20 || input.suppressShortTermRate) return null;
  // 5. 부담부증여는 §159 안분이 총액을 override한다(`transfer-tax-api-split.ts`와 동일 사유).
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return null;
  // 6. 비사업용 토지 자산은 §104의3 정의·기간요건과 §104⑤ 후단(한 필지 내 구분)이 얽힌다 —
  //    P1 범위 밖(계획서 §6 M-12). 자산 단위 판정을 그대로 유지한다.
  if (input.isNonBusinessLand) return null;

  // 파트 양도소득금액 — 자산 단위와 같은 소스(splitDetail)에서 만든다.
  const rawLand = splitDetail.land.gain - splitDetail.land.longTermDeduction;
  const rawBuilding = splitDetail.building.gain - splitDetail.building.longTermDeduction;
  // 7. 어느 파트든 결손이면 자산 내부에서 이미 통산된 뒤다(`transfer-tax-helpers.ts` 합산).
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

  // 8. 파트별 확정세율이 같으면 분해해도 결과가 같다 — 진입하지 않는다(회귀 0의 핵심).
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
