/**
 * 다건 양도 집계의 **감면 3단계** — 합산 재계산(M-8) · 자산별 배분 · 농어촌특별세.
 *
 * `transfer-tax-aggregate.ts` 800줄 정책 분리(2026-08-23 F17). 세 단계는 **한 줄기**다:
 * 유형별로 감면세액을 재계산해 §133 한도를 적용하고(①), 그 결과를 자산별로 배분한 뒤(②),
 * 배분액을 base로 농특세를 판정한다(③). 그래서 한 파일에 둔다 — 쪼개면 ②가 ①의 산출물
 * (`ReductionBreakdownEntry`)을, ③이 ②의 산출물(배분 Map)을 각각 다른 파일에서 찾아야 한다.
 *
 * ⚠️ **호출 순서가 계약이다** — ① → ② → ③. ②는 ①의 `cappedAggregateReduction`을,
 *    ③은 ②의 자산별 몫을 base로 쓴다. 순서를 바꾸면 한도 미반영 금액에 농특세가 붙는다.
 */

import { TRANSFER } from "./legal-codes";
import { reductionTypeLabelOf } from "./transfer-reduction-type-labels";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import {
  applyAnnualLimits,
  applyFiveYearLimits,
  buildLimitGroups,
  lookupLimit,
} from "./aggregate-reduction-limits";
import { resolveTypeLegalBasis } from "./transfer-tax-aggregate-pickers";
import { resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import type { CalculationStep, TransferTaxResult } from "./transfer-tax";
import type {
  ReductionBreakdownEntry,
  TransferTaxItemInput,
} from "./types/transfer-aggregate.types";

/** 집계가 자산별로 들고 있는 최소 정보 — 본 모듈이 읽는 부분만 좁혀 받는다. */
export interface AggregateAssetRecord {
  item: TransferTaxItemInput;
  result: TransferTaxResult;
}

export interface AggregateReductionArgs {
  assetRecords: AggregateAssetRecord[];
  /** 합산 산출세액 (비교과세 반영 후) */
  calculatedTax: number;
  /** 감면후 양도소득금액 합 (자산별) */
  taxableAfterReduction: number[];
  /** 배분된 기본공제 합계 */
  totalBasicDeduction: number;
  taxYear: number;
  priorReductionUsage: { year: number; type: string; amount: number }[];
  /** 비교과세가 세율군별로 적용됐는가 — 경고 문구 분기 */
  comparedByGroups: boolean;
  /** 부수효과 대상 — 호출측 배열을 그대로 변경한다(기존 동작 보존). */
  steps: CalculationStep[];
  warnings: string[];
}

export interface AggregateReductionResult {
  reductionBreakdown: ReductionBreakdownEntry[];
  reductionAmount: number;
}

/** ① M-8 — 유형별 감면 재계산 + 조특법 §133 한도. */
export function aggregateReductions(args: AggregateReductionArgs): AggregateReductionResult {
  const {
    assetRecords, calculatedTax, taxableAfterReduction, totalBasicDeduction,
    comparedByGroups, steps, warnings,
  } = args;
  const input = { taxYear: args.taxYear, priorReductionUsage: args.priorReductionUsage };
  const comparedTaxApplied = comparedByGroups ? "groups" : "total";
  // M-8: 감면 합산 — 유형별 비율 재계산 (조특법 §69 + §127⑦ + §133)
  //      ⚠️ 중복배제는 §127**⑦**이다. 종전에는 「의2」가 붙은 조문을 적었는데 조특법에
  //         그런 조문은 **존재하지 않는다**(KoreanLaw 실측 NOT_FOUND).
  //         §127⑦ 본문: 「둘 이상의 양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가
  //         선택하는 하나의 감면규정만을 적용한다」 (결과탭 코드리뷰 Lane 1 · L2).
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
  /**
   * 🔴 **「소득세법」 §90①의 `− C`** (2026-09-02 · **세액 변경**).
   *
   * §90①: 감면액 = **A × (B − C) / D × E**
   *   A 산출세액 · B 감면대상 양도소득금액 · **C 「§103②에 따른 양도소득 기본공제」**
   *   · D 과세표준 · E 감면율 (법제처 본문 실측)
   *
   * 종전 M-8은 `A × B / D`로 **C를 빼지 않았다**. 그래서 감면소득이 전체 소득의 대부분일 때
   * `B > D`가 되어 **감면이 과대**해졌다 — 실측(§97① 본문 50% · 자산 1건):
   *   단건 82,530,000 ↔ 다건 **82,962,094**(총부담 −388,886). 단건은 §90①과 일치한다.
   *
   * **C의 크기는 §103②이 정한다** — 「감면소득금액이 있는 경우에는 그 **감면소득금액 외의**
   * 양도소득금액에서 **먼저** 공제하고 …」. 즉 기본공제는 비감면소득이 먼저 흡수하고,
   * 흡수하지 못한 잔여만 감면소득에 닿는다:
   *   `C = max(0, 총 기본공제 − 비감면소득)`
   * ⇒ 비감면소득이 250만원 이상이면 C = 0이라 **종전 동작과 같다**. 감면 자산만 있는
   *   사안에서만 발현한다(그때 `(B − C)/D = 1`이 되어 단건과 원 단위까지 맞는다).
   *
   * ⚠️ **§77·§85의10·대토는 제외한다** — 그 세 조문은 자체 산식에서 자산별 기본공제를 이미
   *    빼고 감면율까지 곱해 둔다(`reducibleIncomeNetOfBasicDeduction`). 또 빼면 이중 차감이다.
   *    🔬 다만 그 제외는 **오늘은 no-op**이다 — 세 조문의 감면율이 모두 ≤ 40%라 비감면소득이
   *       항상 기본공제를 흡수해 C = 0이 된다(뮤테이션 0/11,914로 실측). 감면율이 높은 net
   *       유형이 새로 들어올 때를 위한 **방어선**이므로 지우지 말 것.
   * ⚠️ 그 판별을 `aggregateReductionRate` 유무로 하지 말 것 — **다른 축**이다.
   *    §69는 감면율 100%라 rate 축에서는 「반영됨」이지만 기본공제 축에서는 **gross**다.
   */
  const reducibleByType = new Map<
    string,
    { income: number; ratedIncome: number; assetIds: string[]; rates: Set<number>; grossIncome: number }
  >();
  /** §103② — 비감면소득(기본공제를 먼저 흡수하는 쪽) 총액. net 유형은 B가 이미 축소돼 있어 제외한다. */
  let nonReducibleIncome = 0;
  assetRecords.forEach((r, idx) => {
    if (r.result.isExempt) return;
    const gross = r.result.reducibleIncomeNetOfBasicDeduction
      ? taxableAfterReduction[idx] // net 유형은 이 축의 대상이 아니다 — 전액을 비감면 쪽으로 본다
      : r.result.reducibleIncome ?? 0;
    nonReducibleIncome += Math.max(0, taxableAfterReduction[idx] - gross);
  });
  /** §90①의 C — 비감면소득이 흡수하지 못한 기본공제 잔여. */
  const basicDeductionOnReducible = Math.max(0, totalBasicDeduction - nonReducibleIncome);

  for (const r of assetRecords) {
    if (r.result.isExempt) continue;
    const type = r.result.reductionTypeApplied;
    const income = r.result.reducibleIncome ?? 0;
    if (!type || income <= 0) continue;
    const existing =
      reducibleByType.get(type) ??
      { income: 0, ratedIncome: 0, assetIds: [], rates: new Set<number>(), grossIncome: 0 };
    // ⚠️ **감면율은 유형 단위로 균일하지 않다.** `long_term_rental`(0.7·0.5 tier)·
    //    `new_housing`(가격·시기 matrix)은 같은 type 문자열 아래 자산마다 감면율이 다를 수 있다.
    //    그래서 그룹의 rate 하나를 last-write-wins로 덮으면 한쪽 자산에 틀린 율이 곱해진다.
    //    ⇒ **자산별로 먼저 감면율을 곱해 누적**한다(`ratedIncome`).
    //    `income`은 별지84호 부표1 ⑲ 표시용(감면율 前)이라 그대로 둔다.
    const rate = r.result.aggregateReductionRate ?? 1;
    existing.income += income;
    existing.grossIncome += r.result.reducibleIncomeNetOfBasicDeduction ? 0 : income;
    existing.ratedIncome += rate === 1 ? income : applyRate(income, rate);
    existing.assetIds.push(r.item.propertyId);
    existing.rates.add(rate);
    reducibleByType.set(type, existing);
  }

  /** gross 유형 전체의 감면대상소득 합 — C 안분 분모. */
  const totalGrossReducible = [...reducibleByType.values()].reduce((s2, e) => s2 + e.grossIncome, 0);

  // 조특법 §133 유형별 연간 한도 — `aggregate-reduction-limits.ts` 모듈 사용.
  // 유형별 원시 감면세액을 계산한 뒤 그룹 단위로 capping.
  const rawByType = new Map<string, number>();
  for (const [type, entry] of reducibleByType.entries()) {
    // 🔴 분자는 **감면율 반영 후**(`ratedIncome`)를 쓴다. `reducibleIncome`에 감면율이
    //    반영돼 있지 않은 유형(§97 계열·legacy 장기임대·legacy 신축·하이브리드) 때문이다 —
    //    별지84호 부표1 ⑲가 「감면율 前」 금액을 요구해 표시용으로 남아 있다
    //    (코드리뷰 D8-01 — §97① 본문이 다건에서 정확히 2배 감면됐다).
    //    §77·§77의2·§77의3·§69는 rate가 1이라 `ratedIncome === income`이므로 종전과 동일하다.
    /**
     * §90①의 `− C`. gross 유형이 여럿이면 C를 **gross 소득 비중으로 안분**한다 —
     * 조문은 유형별 배분을 정하지 않지만 감면 유형이 하나뿐인 통상 사안에서는 전액이 실려
     * 단건과 정확히 일치한다. net 유형(`grossIncome === 0`)에는 실리지 않는다.
     */
    const cShare =
      totalGrossReducible > 0 && entry.grossIncome > 0
        ? safeMultiplyThenDivide(basicDeductionOnReducible, entry.grossIncome, totalGrossReducible)
        : 0;
    // C는 감면율 前 소득에서 빼는 값이므로 `ratedIncome`에는 유형의 평균 감면율을 실어 반영한다.
    const effectiveRate = entry.income > 0 ? entry.ratedIncome / entry.income : 1;
    const numerator = Math.max(0, entry.ratedIncome - Math.floor(cShare * effectiveRate));
    const raw =
      aggregateTaxBase > 0
        ? safeMultiplyThenDivide(calculatedTax, numerator, aggregateTaxBase)
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
      /**
       * M-8이 실제로 곱한 잔여 감면율 (1 = 이미 reducibleIncome에 반영됨).
       * 그룹 내 감면율이 균일하면 그 값, 자산마다 다르면 소득 가중평균 —
       * 어느 쪽이든 「감면대상소득 × 이 값 = 감면율 반영 소득」 항등식이 성립한다.
       */
      appliedReductionRate:
        entry.rates.size === 1
          ? [...entry.rates][0]
          : entry.income > 0
            ? entry.ratedIncome / entry.income
            : 1,
      legalBasis: info?.legalBasis
        /**
         * 🔴 `lookupLimit`을 **인자 없이** 부르면 `DEFAULT_LIMIT_GROUPS`로 조회한다. 그 기본
         *   그룹②는 `public_expropriation` 하나뿐이라 `gb_designated_land`·
         *   `replacement_land_comp`가 `groupTypes.length === 0`으로 떨어져 감면 근거 자리에
         *   **중복배제 조항(§127⑦)** 이 인쇄됐다. 두 유형은 양도연도 분기본
         *   `buildLimitGroups()`에만 있다 — 바로 위 :103에서 이미 만들어 둔 `limitGroups`를
         *   넘긴다 (결과탭 코드리뷰 #048).
         */
        ? `${lookupLimit(type, limitGroups).groupTypes.length > 0 ? resolveTypeLegalBasis(type) : TRANSFER.REDUCTION_OVERLAP_EXCLUSION} + ${info.legalBasis}`
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

  /**
   * §133③ **분할 양도 1개 과세기간 의제 — 미구현 고지** (코드리뷰 D8-05).
   *
   * 조특법 §133③(시행 2025-04-01본): 「제1항제1호 및 제2항제1호를 적용할 때 토지를
   * 분할(해당 토지의 일부를 양도한 날부터 소급하여 1년 이내에 토지를 분할한 경우를 말한다)하여
   * 그 일부를 양도하거나 토지의 지분을 양도한 후 그 양도한 날로부터 2년 이내에 나머지 토지나
   * 그 지분의 전부 또는 일부를 동일인이나 그 배우자에게 양도하는 경우에는 **1개 과세기간에
   * 해당 양도가 모두 이루어진 것으로 본다**.」
   *
   * 이 의제는 ①1호·②1호의 **연간 한도**에만 걸린다. `applyAnnualLimits`에는 과세기간 병합
   * 개념이 없고, `PriorReductionUsageItem`도 `{year, type, amount}` 3필드뿐이라
   * 「분할일·양수인 동일성」을 담을 자리가 없다.
   *
   * 완전 구현은 분할일·양수인 판정 입력이 필요한 **별도 축**이다. 그때까지는 침묵하지 않고
   * 고지한다 — 대상자가 스스로 합산 여부를 판단할 수 있어야 한다(조용한 과소과세 방지).
   * ⚠️ 자동 추정 금지 — 사용자가 선언하지 않은 사실을 엔진이 지어내지 않는다.
   */
  if (reducibleByType.size > 0) {
    warnings.push(
      "조세특례제한법 §133③(분할 양도 1개 과세기간 의제)은 반영되지 않았습니다. " +
        "양도일부터 소급 1년 이내에 토지를 분할해 일부를 양도했거나, 지분 양도 후 2년 이내에 " +
        "나머지를 동일인·배우자에게 양도한 경우에는 그 양도들이 1개 과세기간에 이루어진 것으로 보아 " +
        "연간 한도를 합산해야 하므로, 해당 사실이 있으면 신고 전 별도 확인이 필요합니다.",
    );
  }

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
        ? `유형별 재계산: ${[...reducibleByType.keys()].map(reductionTypeLabelOf).join(", ")} | 원시 ${totalAggregatedReduction === 0 ? "0" : totalAggregatedReduction.toLocaleString()} + 레거시 ${legacyReductionAmount.toLocaleString()}`
        : `건별 단순합 ${legacyReductionAmount.toLocaleString()} (유형 미지정 감면만 존재)`,
    amount: reductionAmount,
    legalBasis: TRANSFER.REDUCTION_ANNUAL_LIMIT,
  });

  return { reductionBreakdown, reductionAmount };
}

/**
 * ② 감면 배분 — 자산 인덱스 → 배분된 감면세액.
 * 표시(자산별 감면)와 농특세 판정이 이 값을 쓴다.
 */
export function allocateAggregateReductions(
  assetRecords: AggregateAssetRecord[],
  reductionBreakdown: ReductionBreakdownEntry[],
): Map<number, number> {
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
  return reductionAllocations;
}

/** ③ 세액감면형 감면의 농어촌특별세 — 자산별 배분액 기준. */
export function computeAggregateTaxCreditRuralSurtax(
  assetRecords: AggregateAssetRecord[],
  reductionAllocations: Map<number, number>,
  /** 부수효과 대상 — 농특세가 붙으면 근거 step을 남긴다(침묵 금지). */
  steps: CalculationStep[],
): number {
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
  return ruralSurtaxCredit;
}
