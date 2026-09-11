/**
 * 계산명세서 32항목 — **후반 단계**(4단계 다건합산 ~ 7단계 부가세·지방세 + 재개발 overrides)
 * (800줄 분리, 2026-09-11)
 *
 * `DetailedStatementHelpers.ts` 가 856줄로 정책(트리거 800 · 착지 ≤700)을 넘겨 분리했다.
 * `buildStatementItems` 는 713줄짜리 **단일 함수**라 함수 이동이 불가능했다 —
 * 플레이북의 **「거대 단일 함수는 구조분해」** 를 적용해 단계 경계마다 입출력을 실측했다.
 *
 * ⚠️ 처음엔 「내부 구분선이 0개라 자연 이음매가 없다」고 판정했는데 **틀렸다** —
 *    스캔 정규식이 `^  // ─{5,}` 로 좁아 `// ── 4단계: …` 형태를 놓쳤다. 실제로는 단계
 *    마커가 **7개** 있었다([[feedback_regex_charclass_undercounts_population]]).
 *
 * 이 꼬리 구간은 **in 5 · out 0** 이다 — 뒤에 아무것도 없어 반환값이 필요 없고 `items`(Map)에
 * append 만 한다. 호출부는 한 줄이 되고 **하류 참조가 하나도 바뀌지 않는다**.
 *
 * ⚠️ 경계는 **함수의 닫는 `}` 직전**이다 — 다음 함수의 JSDoc 까지 가져가면 tsc 가 잡는다
 *    (플레이북 「JSDoc 역탐색 금지」의 반대 방향 함정).
 */

import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import {
} from "@/components/calc/results/transfer/exempt-gross-gain";
import { reductionTypeLabelOf } from "@/lib/tax-engine/transfer-reduction-type-labels";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import {
} from "./FilingFormTableHelpers";
import {
  buildCalculatedTaxFormula,
  buildDeterminedTaxFormula,
  buildPenaltyFormula,
  setAggregateProcedureItems,
  buildSurtaxAndLocalTaxItems,
} from "./DetailedStatementFormulaBuilders";
import { applyRedevelopmentOverrides } from "./DetailedStatementRedevOverrides";
import { findStepByLabel, buildPerAssetWithFormula } from "./DetailedStatementLeaf";
import type { StatementItem } from "./DetailedStatementConfig";
import { localTaxablePenaltyOf } from "@/components/calc/results/transfer/local-income-tax-display";

/** 후반 단계 — `items` 에 **append 만** 한다(반환 없음 · out 0 실측). */
export function appendLateStageItems(
  items: Map<string, StatementItem>,
  ctx: {
    result: TransferTaxResult;
    isAggregate: boolean;
    primary: AssetForm | undefined;
    properties: PerPropertyBreakdown[];
    totalTransferPrice: number;
    formData: TransferFormData | undefined;
    asset: AssetForm | undefined;
    aggregate: AggregateMeta | undefined;
  },
) {
  const { result, isAggregate, primary, properties, totalTransferPrice, aggregate } = ctx;
  // ── 4단계: 다건 합산 절차 (다건 모드 전용) ─────────────────────────
  // 단건 모드에서는 result.steps에 해당 step이 없으므로 Map.set 자체를 건너뜀
  // → STATEMENT_GROUPS의 'aggregate' 그룹이 빈 itemKeys로 자동 미렌더.
  // 빌더는 sibling 모듈로 분리 (800줄 정책 준수).
  if (isAggregate) {
    setAggregateProcedureItems(items, result);
  }

  // ── 5단계: 세액 산정 ────────────────────────────────────────
  const taxBaseStep = findStepByLabel(result.steps, "과세표준");
  items.set("taxBase", {
    label: "과세표준",
    value: result.taxBase,
    formula: taxBaseStep?.formula ?? "양도소득금액 − 기본공제",
    legalBasis: taxBaseStep?.legalBasis ?? "소득세법 §92",
    summaryOnly: true,
  });

  const calcStep = findStepByLabel(result.steps, "산출세액");
  items.set("calculatedTax", {
    label: "산출세액",
    value: result.calculatedTax,
    formula:
      calcStep?.formula ??
      // 집계에 세율군이 둘 이상이면 단일 세율이 없다 — 「0%」로 찍지 말고 그 사실을 적는다(#071).
      (isAggregate && result.appliedRate === 0
        ? "자산별 세율이 서로 달라 단일 세율로 표시할 수 없습니다 — 아래 자산별 값을 참조하세요"
        : `과세표준 × 세율(${formatRatePct(result.appliedRate)}) − 누진공제 ${result.progressiveDeduction.toLocaleString()}`),
    legalBasis: calcStep?.legalBasis ?? "소득세법 §104·§55",
    note: result.shortTermNote,
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.refCalculatedTax,
          buildCalculatedTaxFormula,
        )
      : undefined,
  });

  const reductionStep = findStepByLabel(result.steps, "감면세액");
  items.set("reductionTax", {
    label: "감면세액",
    value: result.reductionAmount,
    formula:
      reductionStep?.formula ??
      "감면 적용 양도소득금액 비율 × 산출세액 (조특법 §127⑦ 중복배제)",
    legalBasis: reductionStep?.legalBasis ?? "조세특례제한법 §127⑦",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.reductionAggregated,
          (p) => p.reductionAggregated > 0
            ? `합산 재계산 후 ${reductionTypeLabelOf(p.reductionType)} 배분 = ${p.reductionAggregated.toLocaleString()}`
            : "감면 없음",
        )
      : undefined,
  });

  const determinedStep = findStepByLabel(result.steps, "결정세액");
  items.set("determinedTax", {
    label: "결정세액",
    value: result.determinedTax,
    formula: determinedStep?.formula ?? "산출세액 − 감면세액 (원 미만 절사)",
    // §116은 「양도소득세의 **징수**」다 — 계산 근거가 아니다. 결정세액의 정본은 §92③2호
    // 「산출세액에서 §90에 따라 감면되는 세액이 있을 때에는 이를 공제하여 계산」(결과탭 코드리뷰 #028).
    legalBasis: determinedStep?.legalBasis ?? TRANSFER.FINAL_TAX,
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.refDeterminedTax,
          buildDeterminedTaxFormula,
        )
      : undefined,
  });

  // ── 6단계: 가산세·총결정세액 ────────────────────────────────
  const totalPenalty =
    result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
  /**
   * 가산세 귀속은 **슬롯이 아니라 축**으로 가른다.
   *
   * 종전에는 `result.penaltyTax > 0`을 「§114조의2가 있다」로 읽었는데, 그 슬롯의 의미는
   * 생산자마다 다르다(`transfer-result.types.ts`의 `localTaxPenalty` 주석):
   *   · 단건 엔진        → §114조의2분
   *   · 집계·건별 어댑터 → §114조의2 + 국기법 **총액**
   *   · 겸용 어댑터      → 국기법분 **그 자체**(겸용 경로엔 §114조의2가 없다)
   * 그래서 겸용·집계·건별에서 국기법 가산세가 「§114조의2 환산취득가액 가산세」로 이름이
   * 바뀌었고, 어댑터가 0을 넣는 `penaltyBase` 때문에 「= 0 × 5%」라는 성립 불가능한 산식이
   * 함께 나왔다. `localTaxablePenaltyOf`가 §114조의2분의 정본이고 나머지가 국기법분이다.
   *
   * `Math.min`은 방어선이다 — 두 항의 합이 언제나 `totalPenalty`와 같아야 한다.
   * anchor: `__tests__/components/transfer-penalty-attribution.anchor.test.ts`
   */
  const section114_2Penalty = Math.min(localTaxablePenaltyOf(result), result.penaltyTax);
  const statutoryPenalty =
    result.penaltyTax - section114_2Penalty + (result.penaltyDetail?.totalPenalty ?? 0);
  const penaltyParts: string[] = [];
  if (section114_2Penalty > 0) {
    // 산정기준액은 어댑터 경유 result에서 0이다(자산별 값이 합쳐지지 않는다) — 없으면 꼬리를 생략한다.
    penaltyParts.push(
      result.penaltyBase > 0
        ? `§114조의2 환산취득가액 가산세 ${section114_2Penalty.toLocaleString()} (= ${result.penaltyBase.toLocaleString()} × 5%)`
        : `§114조의2 환산취득가액 가산세 ${section114_2Penalty.toLocaleString()}`,
    );
  }
  if (statutoryPenalty > 0) {
    penaltyParts.push(
      `신고불성실·납부지연 가산세 ${statutoryPenalty.toLocaleString()} (국세기본법 §47의2·§47의3·§47의4)`,
    );
  }
  items.set("penaltyTax", {
    label: "가산세액",
    value: totalPenalty,
    formula:
      penaltyParts.length > 0 ? penaltyParts.join(" + ") : "가산세 없음",
    // §47은 「가산세 **부과**」 총칙, §48은 「가산세 **감면** 등」이라 산정 근거가 아니다.
    // 엔진이 실제로 적용하는 조문은 §47의2(무신고)·§47의3(과소신고)·§47의4(납부지연)이고,
    // §92③3호도 「§47의2부터 §47의4까지」라고 지목한다 (결과탭 코드리뷰 #029).
    legalBasis: "소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.penaltyTax + p.filingDelayedPenaltyTax,
          buildPenaltyFormula,
        )
      : undefined,
  });

  items.set("totalDeterminedTax", {
    label: "총결정세액",
    value: result.determinedTax + totalPenalty,
    formula: `결정세액 ${result.determinedTax.toLocaleString()} + 가산세액 ${totalPenalty.toLocaleString()} = ${(result.determinedTax + totalPenalty).toLocaleString()}`,
    // §92③3호 — 「결정세액에 §114의2, §115 및 「국세기본법」 §47의2부터 §47의4까지에 따른
    // 가산세를 더하여 계산」. 같은 화면 신고서 양식이 이미 그렇게 설명하고 있다(#028).
    legalBasis: "소득세법 §92③3호",
  });

  // ── 7단계: 부가세·지방세 ───────────────────────────────────
  // 집계 모드의 농특세는 엔진 2-pass 산정 합계가 정본 — 어댑터가 단건 detail을 안 담아 종전엔 0이었다.
  const aggRuralSurtax = isAggregate ? aggregate!.aggregated.ruralSurtax ?? 0 : undefined;
  buildSurtaxAndLocalTaxItems(items, result, totalPenalty, aggRuralSurtax);

  // ── 재개발 3분할 overrides (단건·환산 모드, isAggregate와 mutually exclusive) ──
  // result.redevelopmentDetail 존재 시 1단계 양도차익 산정 그룹 항목에 perAsset[] 3분할 부착.
  // 합계값은 기존 단건 합계 그대로 유지 → 32-항목 합계 anchor 회귀 0.
  if (!isAggregate && result.redevelopmentDetail) {
    // subject 도출: assetKind="right_to_move_in" 또는 redevSubject="right" → "right"
    const redevSubject: "apt" | "right" =
      primary?.assetKind === "right_to_move_in" || primary?.redevSubject === "right"
        ? "right"
        : "apt";
    // settlementDirection 도출 (R-5 right+receive 분기 라벨 분기용)
    const redevSettlementDir: "pay" | "receive" | undefined =
      primary?.redevSettlementDirection === "pay" || primary?.redevSettlementDirection === "receive"
        ? primary.redevSettlementDirection
        : undefined;
    applyRedevelopmentOverrides(items, result.redevelopmentDetail, totalTransferPrice, redevSubject, redevSettlementDir, result.lthdExclusionReason);
  }

}

/**
 * 세율 표시.
 *
 * ⚠️ 인자는 **`appliedRate` 하나**다 — 이미 중과를 포함한 실효세율이기 때문이다
 * (`transfer-tax-rate-calc.ts`: `baseRate + additionalRate × ratio`).
 * 종전에는 `surchargeRate`를 함께 받아 더했고, 그 결과 중과분이 **두 번** 계상됐다
 * (실측: 비사업용 토지 기본 45% + 10%p → 실효 55%인데 화면에는 65%).
 * `transfer-tax-aggregate.ts`의 `refCalculatedTax`가 같은 이유로 정정된 것과 같은 축이다.
 */
function formatRatePct(rate: number): string {
  if (rate === 0) return "0%";
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
