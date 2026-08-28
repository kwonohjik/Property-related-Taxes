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
import { safeMultiplyThenDivide } from "./tax-utils";
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
