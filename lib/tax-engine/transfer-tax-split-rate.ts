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
import { applyRate, calculateProgressiveTax } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcTax, computeBracketBreakdown, clauseBucketKey } from "./transfer-tax-rate-calc";
import type { RateClause } from "./transfer-tax-rate-calc";
import { resolveAppurtenantLandRateBasisDate } from "./transfer-tax-appurtenant-land";
import { resolveLandStatutoryAcquisitionDate } from "./transfer-tax-appurtenant-land";
import { buildLandRateInput } from "./transfer-tax-appurtenant-land";
import { allocateBasicDeduction } from "./transfer-tax-aggregate-helpers";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { RateGroup } from "./types/transfer-aggregate.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/**
 * 부수토지 축은 `transfer-tax-appurtenant-land.ts`로 분리했다(800줄 정책).
 * **종전 import 경로를 깨지 않도록 여기서 그대로 재수출**한다
 * (memory `feedback_800line_split_export_preservation`).
 */
export {
  resolveAppurtenantLandRateBasisDate,
  resolveLandStatutoryAcquisitionDate,
  isLaterAcquiredLandExemptExcluded,
  resolveAppurtenantLandExcess,
  applyHousingLandExclusions,
  hasHousingLandExemptExclusion,
} from "./transfer-tax-appurtenant-land";
export type {
  AppurtenantLandExcess,
  HousingLandExclusionResult,
} from "./transfer-tax-appurtenant-land";

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
  /**
   * 이 파트가 해당하는 **§104 각 호** — 다건 「호별 합산」의 그룹 키다.
   *
   * §104⑤2호 **본문**의 「자산별」은 예규가 **「제104조 각 호별로 합산한 자산」**으로 확정했다
   * (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」
   * 2018.6.21.). 자산 하나가 둘 이상의 호에 걸치면(split · 부분 비사토) **파트가 곧 합산
   * 단위**이므로, 파트가 자기 호를 들고 나와야 `aggregateByGroup`이 호별로 묶을 수 있다.
   *
   * `undefined`는 「호를 단정할 수 없음」이다 — 묶지 않는 것이 안전측이다
   * (`unifiedShortTermClause`가 그 경우 undefined를 낸다).
   */
  rateClause?: RateClause;
  /**
   * 이 파트가 **해당**하는 §104 호 **전부**(정렬) — `calcTax`가 낸 값을 그대로 싣는다.
   * `rateClause`는 §104① 후단·⑦ 후단의 **승자**라 그룹핑 키로 쓰면 「해당 호는 같은데 승자만
   * 갈린」 파트가 나뉜다(계획서 `transfer-rate-clause-candidates` E-2).
   */
  candidateClauses?: RateClause[];
  /**
   * 이 파트의 **세율 판정에 실제로 쓰인 입력** — 다건 호별 합산이 같은 규칙을 재현하려면 필요하다.
   *
   * 호 묶음 세액은 `calcTax(합산 과세표준, 대표 파트의 rateInput)`으로 낸다.
   * `aggregateByGroup`이 이 값을 재구성하면 **dual-truth**가 된다 — 토지 파트는
   * `buildLandRateInput`으로 §104② 기산일을 확정한 뒤 자산 단위 재적용을 무력화했고,
   * 비사업용 파트는 `nonBusinessLandAreaRatio`를 1로 되돌린 입력이기 때문이다.
   * ⇒ **만든 쪽이 그대로 실어 보낸다**(memory `feedback_ui_engine_dual_truth_avoidance`).
   */
  rateInput: TransferTaxInput;
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
  // 다건 정본(`transfer-tax-aggregate-helpers.ts`)과 **같은 키 함수**를 쓴다(단일 소스).
  // 🔶 여기도 아직 `rateClause`(**승자**)를 넘긴다 — 계획서 E-2. Q3에서 `candidateClauses`로
  //   바꾼다(파트는 이미 그 배열을 들고 있다).
  //
  // 실제로 합쳐지는 조합은 「배율내 토지 + 건물」이 같은 호일 때뿐이다 — 비사토 파트가 있으면
  // 토지 파트는 `isNonBusinessLand: false`로 강제되므로(위 seeds) 8호 묶음은 항상 단일이다.
  const clauseGroups = new Map<string, number[]>();
  seeds.forEach((_, i) => {
    const k = clauseBucketKey(
      finals[i].rateClause ? [finals[i].rateClause!] : undefined,
      finals[i].appliedRate,
      i,
    );
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
    // 위 `clauseKey`가 이미 쓰고 있던 값을 밖으로 내보낸다 — 다건 호별 합산의 그룹 키(P12).
    rateClause: finals[i].rateClause,
    candidateClauses: finals[i].candidateClauses,
    rateInput: s.rateInput,
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
 * 한 필지 중 **일부만** 비사업용인 토지인가 — §104⑤ 본문 **후단**의 「별개 자산 의제」가
 * 걸리는 자산인지 판정한다.
 *
 * **단일 소스다.** `computePartialNblTax`(자산 세액 계산)와 다건 `aggregateByGroup`
 * (그룹 합산 금지 판정)이 **같은 술어**를 써야 한다 — 한쪽만 바뀌면 자산별 경로와 그룹 합산
 * 경로가 갈려 §104⑤가 조용히 우회된다(계획서 D-12).
 * memory `single-source-engine-helper`
 */
export function hasPartialNonBusinessLand(input: TransferTaxInput): boolean {
  const ratio = input.nonBusinessLandAreaRatio;
  // `ratio = 1`(전량 비사토)·미지정은 **나눌 대상이 없다** — 파트가 하나뿐이라 2호 = 종전
  // 세액이고 2호 ≥ 1호다. 압도적 다수 경로가 여기라 정정 범위가 `0 < ratio < 1`로 닫힌다.
  return input.isNonBusinessLand === true && ratio !== undefined && ratio > 0 && ratio < 1;
}

/**
 * 한 필지 중 **일부만** 비사업용인 토지 — §104⑤ 비교과세 (계획서 D-10 · P8).
 *
 * [법령 — §104⑤ 본문 **후단**]
 *   "이 경우 **제2호의 금액을 계산할 때** … **한 필지의 토지가 제104조의3에 따른 비사업용
 *    토지와 그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아** 양도소득
 *    산출세액을 계산한다." (2018.4.1. 이후 양도분 · 대법원 2014.10.30. 2012두15371 취지)
 *
 * 종전에는 `calcTax` T-2가 「누진(**전체** 과세표준) + 10%p × 비사토분」을 냈다(모델 A).
 * 1호(가산 없는 합산 누진)도 2호(호별 산출세액 합)도 아니어서 항상 MAX를 초과했다.
 *
 * **`calcTax`는 건드리지 않는다** — 호출부가 9곳이고 그 계약은 「자산 하나의 세액」이다.
 * 여기서 파트를 나눠 각각 `calcTax`에 위임하므로 **신규 세율 로직이 0**이다.
 *
 * @returns 부분 비사토가 아니면 `null`(호출부가 종전 경로로 후퇴)
 */
function computePartialNblTax(
  ctx: SplitPartRateContext,
  fallback: () => ReturnType<typeof calcTax>,
): (ReturnType<typeof calcTax> & { splitPartDetail?: SplitPartRateResult }) | null {
  const input = ctx.taxRateInput;
  if (!hasPartialNonBusinessLand(input)) return null;
  const ratio = input.nonBusinessLandAreaRatio!;
  if (ctx.taxBase <= 0) return null;

  // 안분 기준은 **면적비율**로 종전(`calcTax` T-2)과 동일하게 둔다. split이 쓰는
  // 「기본공제를 최고세율 파트에 전액 귀속」으로 바꾸는 것은 P8 범위 밖이다(Surgical).
  const nblBase = applyRate(ctx.taxBase, ratio);
  const otherBase = ctx.taxBase - nblBase;
  if (nblBase <= 0 || otherBase <= 0) return null;

  // 2호 — 각 파트를 `calcTax`에 그대로 위임한다.
  //   비사토 파트: `ratio`를 1로 되돌려 자기 과세표준 **전량**에 §104①8호(+ §104① 후단) 적용
  //   그 외 파트 : 비사업용이 아니므로 §104①1호(2년 미만이면 2·3호)
  // 파트별 세율 판정 입력 — 아래 파트 상세가 **같은 객체**를 실어 보낸다(재구성 금지).
  const nblRateInput: TransferTaxInput = { ...input, nonBusinessLandAreaRatio: 1 };
  const otherRateInput: TransferTaxInput = {
    ...input,
    isNonBusinessLand: false,
    nonBusinessLandAreaRatio: undefined,
  };
  const nblPart = calcTax(nblBase, ctx.parsedRates, nblRateInput, ctx.multiHouseSurchargeResult);
  const otherPart = calcTax(otherBase, ctx.parsedRates, otherRateInput, ctx.multiHouseSurchargeResult);
  const clause2 = nblPart.calculatedTax + otherPart.calculatedTax;
  // 1호 — 양도소득과세표준 합계액에 §55①에 따른 세율만. 가산이 없다.
  const clause1 = calculateProgressiveTax(ctx.taxBase, ctx.parsedRates.brackets);

  // ── 파트 상세 (P12 1단계) ───────────────────────────────────────────
  // **세액 판정에는 쓰지 않는다.** split 경로(`computeSplitPartTax`)와 **같은 형태**로
  // 파트를 내보내, 다건 `aggregateByGroup`이 §104⑤2호 본문의 **호별 합산** 단위를 잡을 수
  // 있게 한다(예규 「"자산별" = 각 호별로 합산한 자산」 — §1.6-A). 2단계에서 소비한다.
  //
  // 소득금액·기본공제 배분은 자산 단위에서 이미 끝났으므로, 과세표준과 **같은 면적비율**로
  // 되돌려 표시값을 만든다. 마지막 파트가 잔액을 흡수해
  // `Σ 파트 = 자산 값` 불변식을 지킨다(memory `feedback_floor_residual_absorption`).
  //
  // 배분액을 clamp하지 않는다 — 음수가 될 수 없기 때문이다(엔진이 조용히 0으로 깎으면
  // 오답이 눈에 띄지 않는다는 것이 이 파일 전반의 규약이다):
  //   `transferIncome ≥ taxBase`이고 `applyRate`는 floor라 `nblIncome ≥ nblBase`,
  //   `floor(ti·r) − floor(tb·r) ≤ ⌈(ti−tb)·r⌉ ≤ ti − tb`(r ≤ 1)라 그 외 파트도 음수가 안 된다.
  //   ⇒ `Σ allocatedBasicDeduction = basicDeduction`이 성립한다(anchor A-3c가 고정).
  const nblIncome = applyRate(ctx.transferIncome, ratio);
  const otherIncome = ctx.transferIncome - nblIncome;
  const splitPartDetail: SplitPartRateResult = {
    parts: [
      {
        kind: "non_business_land",
        // 한 필지 내부 분할이라 두 파트의 §104② 기산일은 같다(취득일이 하나다).
        basisDate: input.acquisitionDate,
        income: nblIncome,
        allocatedBasicDeduction: nblIncome - nblBase,
        taxBase: nblBase,
        calculatedTax: nblPart.calculatedTax,
        appliedRate: nblPart.appliedRate,
        rateClause: nblPart.rateClause,
        candidateClauses: nblPart.candidateClauses,
        rateInput: nblRateInput,
        surchargeType: nblPart.surchargeType,
        surchargeRate: nblPart.surchargeRate,
        nblSurchargeExcluded: nblPart.nblSurchargeExcluded,
      },
      {
        // 비사업용이 아닌 나머지 토지 — split의 「토지」 파트와 같은 자리다.
        kind: "land",
        basisDate: input.acquisitionDate,
        income: otherIncome,
        allocatedBasicDeduction: otherIncome - otherBase,
        taxBase: otherBase,
        calculatedTax: otherPart.calculatedTax,
        appliedRate: otherPart.appliedRate,
        rateClause: otherPart.rateClause,
        candidateClauses: otherPart.candidateClauses,
        rateInput: otherRateInput,
        surchargeType: otherPart.surchargeType,
        surchargeRate: otherPart.surchargeRate,
      },
    ],
    perAssetTotal: clause2,
    aggregateProgressive: clause1,
    // 아래 분기와 **같은 규약**(`clause1 >= clause2`이면 1호)을 쓴다.
    chosen: clause1 >= clause2 ? "aggregate" : "per_asset",
  };

  if (clause1 >= clause2) {
    const base = fallback();
    // 1호가 이겼고 값이 종전과 같으면 **세액은 아무것도 바뀌지 않는다** — 산식 문구까지 종전
    // 그대로 둔다(위기취득 중과배제로 가산이 0인 경우가 여기다).
    // 파트 상세만 얹는다 — 호별 합산 단위는 승패와 무관하게 필요하다(P12).
    if (base.calculatedTax === clause1) return { ...base, splitPartDetail };
    const { baseRate, deduction } = computeBracketBreakdown(ctx.taxBase, ctx.parsedRates.brackets);
    return {
      calculatedTax: clause1,
      appliedRate: baseRate,
      progressiveDeduction: deduction,
      surchargeSuspended: false,
      ...(nblPart.nblSurchargeExcluded ? { nblSurchargeExcluded: true } : {}),
      shortTermNote:
        `한 필지 중 비사업용 ${Math.round(ratio * 100)}% 분리(소득세법 §104⑤ 본문 후단): ` +
        `합산 누진세액 ${clause1.toLocaleString()}이 별개 자산별 합계 ` +
        `${clause2.toLocaleString()}보다 크다`,
      splitPartDetail,
    };
  }
  return {
    splitPartDetail,
    calculatedTax: clause2,
    appliedRate: Math.max(nblPart.appliedRate, otherPart.appliedRate),
    progressiveDeduction: 0,
    surchargeSuspended: false,
    // 파트 중과 사실을 자산 단위로 끌어올린다 — 결과 카드의 중과 배지·법령근거가 사라지지 않도록.
    surchargeType: nblPart.surchargeType,
    surchargeRate: nblPart.surchargeRate,
    ...(nblPart.nblSurchargeExcluded ? { nblSurchargeExcluded: true } : {}),
    shortTermNote:
      `한 필지 중 비사업용 ${Math.round(ratio * 100)}% 분리(소득세법 §104⑤ 2호·본문 후단): ` +
      `비사업용 ${nblPart.calculatedTax.toLocaleString()} + 그 외 ` +
      `${otherPart.calculatedTax.toLocaleString()} ` +
      `(합산 누진세액 ${clause1.toLocaleString()}과 비교한 큰 세액)`,
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
  // 토지·건물 분리취득이 아니어도 **한 필지 안에서** 비사업용/그 외로 갈리면 §104⑤가 걸린다.
  if (!ctx.splitDetail) return computePartialNblTax(ctx, fallback) ?? fallback();

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
