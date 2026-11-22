/**
 * 계산결과 상세명세서 — 자산별 산식 빌더 (사례 31·33 일반건물)
 *
 * 사용자가 자산별 펼침 행에서 "왜 이 값인가"를 직관적으로 검증할 수 있도록
 * 사용자 지정 형식의 산식 문자열을 생성:
 *   토지 양도가액 = 330,000,000 × 339,492,000 / (339,492,000+12,308,310+54,501,720)
 *                = 275,736,648
 *
 * 사례 분기:
 *  - 사례 31 (환산취득가, 증축 없음) — 2-way 양도가 안분 + 환산취득가 §176의2②
 *  - 사례 33 (일괄+증축) — 3-way 양도가 안분 + 토지·건물1 일괄 안분 + 건물2 환산
 *
 * 데이터 출처: result.generalBuildingValuationDetail (GeneralBuildingOutput).
 *  - landStdTotal·buildingStdTotal·extensionStdTotal (양도시 분모)
 *  - acqLandStdTotal·acqBuilding1StdTotal·acqExtensionStdTotal (취득시 분모)
 */

import { createElement, Fragment, type ReactNode } from "react";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { applyRate, safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE, ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { selfBuiltPenaltyBasisFormula } from "@/lib/tax-engine/transfer-tax-self-built-display";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { LOSS_OFFSET_PART_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";

/**
 * 엔진 §95③ 12억 초과 안분 STEP formula(문자열)를 Frac 분수 표기로 변환 (PR #746 표준).
 * 형식: "<차익> × (<라벨 분자> - 12억) / <라벨 분모>" — 미일치 시 원문 문자열 fallback.
 * .ts 파일이라 JSX 대신 createElement 사용.
 */
export function prorationFormulaAsFrac(formula: string): ReactNode {
  const m = formula.match(/^(.+?) × \((.+?)\) \/ (.+)$/);
  if (!m) return formula;
  return createElement(
    Fragment,
    null,
    `${m[1]} × `,
    createElement(Frac, { top: m[2], bottom: m[3] }),
  );
}
// ── 일반건물(GB) 파트별 산식 — `DetailedStatementGbFormulas.ts`로 분리 (800줄 정책) ───
// 재-export: 종전 이 파일에서 import하던 소비자(테스트 포함)가 깨지지 않게 한다.
export {
  buildAllocationFormula,
  buildResidualFormula,
  buildGbTransferFormula,
  buildGbAcquisitionFormula,
  buildGbExpenseFormula,
} from "./DetailedStatementGbFormulas";
// ── 취득가액·필요경비 산식 — `DetailedStatementAcqExpenseFormulas.ts`로 분리 (800줄 정책) · 같은 이유로 재-export ───
export { buildAcquisitionPriceFormula, buildNecessaryExpenseFormula } from "./DetailedStatementAcqExpenseFormulas";
import { fmt } from "./DetailedStatementGbFormulas";
import { effectiveGrossGain, assetTaxableGain, capExInAcquisitionColumnOfProperty } from "./exempt-gross-gain";
import { rhPartialBasis, rhPartialTaxableGainFormula, rhPartialLthFormula, rhPartialIncomeFormula } from "./DetailedStatementRhPartialFormulas";

// ── 단순 산식 (자산별 동일 산식) ──────────────────────────────────

/**
 * 양도차익 = 양도가액 − 취득가액 − 필요경비
 *
 * 🔴 우변은 `effectiveGrossGain`이다 — 전액 비과세 자산은 엔진 `transferGain`이 **0**이라
 *   `p.transferGain`을 쓰면 「1,000,000,000 - 400,000,000 - 10,000,000 = 0」처럼
 *   **좌변이 우변을 만들지 못하는 거짓 등식**이 출력됐다(2026-09-06 UI 리뷰 실측).
 *   같은 화면 신고서 양식은 이미 `effectiveGrossGain`을 쓰고 있어 두 표가 어긋났다.
 */
export function buildSubGainFormula(p: PerPropertyBreakdown): string {
  const capExShift = capExInAcquisitionColumnOfProperty(p);
  const displayAcq = p.acquisitionPrice + capExShift;
  const displayExp = Math.max(0, p.necessaryExpense - capExShift);
  return `${fmt(p.transferPrice)} - ${fmt(displayAcq)} - ${fmt(displayExp)} = ${fmt(effectiveGrossGain(p))}`;
}

/**
 * 과세대상 양도차익 = min(전체양도차익, max(0, income) + 장특공제)
 *
 * 🔴 여기도 `effectiveGrossGain` 축이다 — `p.transferGain`(비과세면 0)을 쓰면 비과세 자산이
 *   **「차손 자산 — 양도차익 0 (음수)」**로 표시됐다(2026-09-06 UI 리뷰 실측). 비과세와 차손은
 *   전혀 다른 사실이다. 과세대상 금액 자체는 `assetTaxableGain` leaf가 정한다(재구현 금지).
 */
export function buildTaxableGainFormula(p: PerPropertyBreakdown): string {
  const tg = effectiveGrossGain(p);
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = assetTaxableGain(p);
  if (tg <= 0 && (p.isExempt || taxable === tg)) return `차손 자산 — 양도차익 ${fmt(tg)} (음수)`;
  // §155⑳ 특례 × 12억 초과 — 장특이 전체 차익 기준이라 «양도소득금액 + 장특» 역산이 법정 율에 안 맞는다(위 파일 머리 주석).
  //   R-c06-04 — 과세대상 = 전체 양도차익(단건 규약 · 비과세분은 양도소득금액 단계). 값은 `filingTaxableGainOf`.
  const rhBasis = rhPartialBasis(p);
  if (rhBasis) return rhPartialTaxableGainFormula(rhBasis);
  // R-c10-02 — 엔진은 차손 자산도 과세분을 따로 정한다(고가주택은 기준금액 초과분만 · 배율 초과분 이익은 비과세분 차손과 통산하지 않는다).
  if (taxable < 0) return `양도차손 ${fmt(tg)} 중 과세분 = ${fmt(taxable)} (비과세분 차손은 다른 자산과 통산하지 않는다)`;
  if (taxable > tg) return `양도소득금액 ${fmt(inc)} + 장특공제 ${fmt(lth)} = ${fmt(taxable)} (전체 양도차익 ${fmt(tg)} 중 비과세분 차손은 과세분에서 빼지 않는다)`;
  // 🔴 종전 문구는 `min(양도차익 A, 양도소득금액 B + 장특공제 C = sum) = 결과`였다
  //    (2026-09-08 · 산식 한국어 풀어쓰기). 두 가지가 규약 위반이었다 —
  //    ① 함수 표기 `min(...)` ② 괄호 안의 **중간 산술 결과** `= sum`
  //    (`feedback_result_view_korean_formula`: 「중간 산술 결과 표기 금지」).
  //    형제 산식(:62·:93·:145)은 전부 「입력값과 연산 기호 + = 결과값」 한 겹이다.
  return `양도차익 ${fmt(tg)}과 (양도소득금액 ${fmt(inc)} + 장특공제 ${fmt(lth)}) 중 작은 금액 = ${fmt(taxable)}`;
}

/** 장특공제 = 과세대상양도차익 × 율 */
export function buildLthFormula(p: PerPropertyBreakdown): string {
  if (p.longTermHoldingDeduction === 0) {
    // 🔴 비과세 자산은 엔진 `transferGain`이 0이라 `<= 0` 하나로 가르면 「차손 자산」으로 찍혔다(비과세와 차손은 전혀 다른 사실 —
    //   위 `buildTaxableGainFormula`와 같은 이유). 비과세 여부를 먼저 본다.
    if (p.isExempt) return "비과세 자산 — 장특공제 미적용";
    return p.transferGain <= 0 ? "차손 자산 — 장특공제 미적용" : "보유 3년 미만 또는 비적용 자산";
  }
  const rhBasis = rhPartialBasis(p);
  if (rhBasis) return rhPartialLthFormula(rhBasis, p.longTermHoldingDeduction);
  // 과세대상양도차익 — 자산별 정본 leaf(`assetTaxableGain`). 종전 인라인 `차손이면 transferGain`은 배율 초과분 이익 자산의 분모를 차손으로 잡았다(R-c10-02).
  const lth = p.longTermHoldingDeduction;
  const taxable = assetTaxableGain(p);
  if (taxable <= 0) return `장특공제 ${fmt(lth)}`;
  const ratePct = ((lth / taxable) * 100).toFixed(1).replace(/\.0$/, "");
  return `과세대상양도차익 ${fmt(taxable)} × ${ratePct}% = ${fmt(lth)}`;
}

/**
 * 양도소득금액 = 과세대상양도차익 − 장특공제 (음수 가능 — 차손).
 *
 * 🔴 이 항목이 **표시하는 값은 `incomeAfterOffset`(§102② 차손 통산 後)** 인데 종전 산식은
 *   `p.income`(통산 前)에서 끝났다. 차손이 섞인 다건에서 「490,000,000 - 98,000,000 =
 *   392,000,000」이라 적어놓고 옆에는 342,000,000을 찍어 **좌변이 우변을 만들지 못했다**
 *   (결과탭 코드리뷰 #072). 통산 단계를 산식에 드러낸다.
 */
export function buildIncomeFormula(
  p: PerPropertyBreakdown,
  lossGiven = 0,
  givenParts: (keyof typeof LOSS_OFFSET_PART_LABEL)[] = [],
): string {
  const lth = p.longTermHoldingDeduction;
  // 과세대상양도차익 — 자산별 정본 leaf(`assetTaxableGain`). 종전 인라인 `차익이면 min(gross, …) · 차손이면 gross`는 과세분이 따로 정해진 차손 자산에서 좌변이 우변을 만들지 못했다(R-c10-02).
  const taxable = assetTaxableGain(p);
  const received = p.lossOffsetFromSameGroup + p.lossOffsetFromOtherGroup;
  // R-c06-04 — §155⑳ 부분과세 자산은 단건 규약: 양도소득금액 = 전체 양도차익 − 장특(비과세 양도소득금액은 아래 행에서 뺀다).
  //   이 자산은 파트가 없어(`splitDetail` 제외) 차손을 내지 않는다 — 받은 통산만 잇는다. 값은 `incomeAfterOffset + 비과세 양도소득금액`.
  const rhBasis = rhPartialBasis(p);
  if (rhBasis) {
    const base = rhPartialIncomeFormula(rhBasis, lth);
    return received > 0 ? `${base} − 결손금 통산 ${fmt(received)} = ${fmt(p.incomeAfterOffset + rhBasis.nontaxableIncome)}` : base;
  }
  const base = `${fmt(taxable)} - ${fmt(lth)} = ${fmt(p.income)}`;
  if (p.income === p.incomeAfterOffset) return base;
  // **이익 자산**이 자기 파트(대개 건물) 차손을 다른 자산에 준 경우 — 토지·건물은 통산에서 각각의 자산이라(국심2007중3718) 그 차손이
  //   신고 전체의 같은 세율 자산부터 공제된다(영 §167의2①). 자산 양도소득금액(파트 합)에서 이미 뺀 몫이므로 되돌려 더한다(계획서 P2 Q-3).
  if (lossGiven > 0 && p.income > 0) {
    const who = givenParts.length > 0 ? givenParts.map((k) => LOSS_OFFSET_PART_LABEL[k]).join("·") : "파트";
    const recv = received > 0 ? ` − 결손금 통산 ${fmt(received)}` : "";
    return `${base} + ${fmt(lossGiven)}(${who} 양도차손 중 다른 자산의 양도소득금액에서 공제된 몫)${recv} = ${fmt(p.incomeAfterOffset)}`;
  }
  // 차손을 **받은** 자산: 통산액이 자기 필드에 실린다.
  if (received > 0) return `${base} − 결손금 통산 ${fmt(received)} = ${fmt(p.incomeAfterOffset)}`;
  // 차손을 **낸** 자산: 나간 몫(`lossGiven` — 엔진 `lossOffsetTable`)과 통산되지 못해 **소멸**한 몫을 가른다.
  //   종전에는 차손 전액이 「통산되어」 0이 된다고 적어, 소멸분(이월 불인정)을 통산으로 오서술했다.
  const expired = Math.max(0, -p.income - lossGiven);
  const gave = `이 차손 중 ${fmt(lossGiven)}이 다른 자산의 양도소득금액에서 공제(통산)되었습니다`;
  return expired > 0
    ? `${base} → ${gave} — 통산되지 못한 ${fmt(expired)}은 소멸하여 ${fmt(p.incomeAfterOffset)}`
    : `${base} → ${gave} = ${fmt(p.incomeAfterOffset)}`;
}

/**
 * 산출세액(참고) = 그룹 과세표준 기여분 × (적용세율 + 중과세율) − 누진공제.
 *
 * 🔴 **파트 분할 자산(§104⑤)에서는 이 근사식이 성립하지 않는다.** `appliedRate`가 그 자산의
 *   **파트 최고세율**이라 자산 과세표준 전체에 곱하면 과대해진다(엔진 주석 실측 +87,140,000).
 *   그런 자산의 세액은 엔진이 `refCalculatedTaxNote`에 파트 내역을 담아 보내므로 그것을 우선한다 —
 *   형제 카드(`MultiTransferPropertyBreakdown`의 「산출세액 (참고)」)가 이미 같은 순서를 쓴다.
 *   종전에는 명세서만 근사식을 고정 출력해 한 화면에서 같은 숫자에 다른 설명이 붙었다
 *   (결과탭 코드리뷰 #103).
 */
export function buildCalculatedTaxFormula(p: PerPropertyBreakdown): string {
  if (p.refCalculatedTaxNote) return p.refCalculatedTaxNote;
  /**
   * 🔴 **`surchargeRate`를 더하지 않는다** (2026-09-06 · UI 리뷰 `surcharge-rate-double-count`).
   *
   * `appliedRate`는 **이미 중과를 포함한 실효세율**이다 —
   * `transfer-tax-rate-calc.ts:410` `appliedRate: roundRate(baseRate + additionalRate * ratio)`,
   * 타입 주석도 「`surchargeRate`를 더하면 이중 계상」이라 못박고 있다
   * (`types/transfer-aggregate.types.ts:191`).
   *
   * 종전에는 비사업용 토지(기본 45% + 10%p = 실효 55%)가 화면에 **65%**로 찍혔고, 금액은
   * 엔진이 55%로 낸 `refCalculatedTax`라 **산술적으로 성립하지 않는 등식**이 출력됐다.
   * 형제 표시부(`FilingFormTableRowDefs.ts:31 fmtRatePct` · `DetailedStatementHelpers.ts`
   * `formatRatePct`)는 2026-09-02에 이미 정정됐고 여기만 남아 있었다.
   */
  const ratePct = (p.appliedRate * 100).toFixed(1).replace(/\.0$/, "");
  const surcharged = (p.surchargeRate ?? 0) > 0 ? " (중과 포함)" : "";
  return `${fmt(p.taxBaseShare)} × ${ratePct}%${surcharged} - ${fmt(p.progressiveDeduction)} = ${fmt(p.refCalculatedTax)}`;
}

/** 결정세액 = 산출세액 − 감면 (자산별 참고값) */
export function buildDeterminedTaxFormula(p: PerPropertyBreakdown): string {
  if (p.reductionAggregated > 0) {
    return `${fmt(p.refCalculatedTax)} - ${fmt(p.reductionAggregated)} = ${fmt(p.refDeterminedTax)}`;
  }
  return `${fmt(p.refCalculatedTax)} (감면 없음)`;
}

/**
 * 가산세액 = 「소득세법」 §114조의2 + 「국세기본법」 §47의2~§47의4 신고불성실·납부지연.
 *
 * 🔴 G-38: 법령명 없이 「§114의2」로 적으면 어느 법의 조문인지 화면에서 알 수 없고,
 * 같은 화면의 다른 행이 쓰는 「§114조의2」와 조 표기까지 갈린다.
 */
export function buildPenaltyFormula(p: PerPropertyBreakdown): string {
  const parts: string[] = [];
  // 일체 주택 본인 신축은 가산세 base 가 건물분이다 — 자산별 줄에도 그 사실을 밝힌다(echo 값 그대로, Q-12 PR-3).
  const selfBasis = selfBuiltPenaltyBasisFormula(p.selfBuiltHousingPenalty);
  if (p.penaltyTax > 0) parts.push(`소득세법 §114조의2 ${fmt(p.penaltyTax)}${selfBasis ? ` (${selfBasis})` : ""}`);
  if (p.filingDelayedPenaltyTax > 0)
    parts.push(`국세기본법 §47의2~§47의4 신고불성실·납부지연 ${fmt(p.filingDelayedPenaltyTax)}`);
  if (parts.length === 0) return "가산세 없음";
  return `${parts.join(" + ")} = ${fmt(p.penaltyTax + p.filingDelayedPenaltyTax)}`;
}

// ── 다건 합산 절차 항목 빌더 (다건 모드 전용) ─────────────────────────

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { StatementItem } from "./DetailedStatementHelpers";
// 순환 차단 — `DetailedStatementIncomeItems.ts`(원본에서 분리)가 이 파일을 import하므로 원본 재수출이 아니라 leaf에서 가져온다.
import { findStepByLabel } from "./DetailedStatementLeaf";
import { resolveRuralSurtax } from "./reduction-eligible-income";
import {
  localCalculatedTaxFormula,
  localTaxablePenaltyOf,
} from "@/components/calc/results/transfer/local-income-tax-display";
import { localIncomePenaltyStatementItem } from "./local-income-penalty-display";

/**
 * 다건 합산 절차 3개 항목(차손통산·기본공제 배분·비교과세)을 Map에 추가.
 *
 * 단건 모드에서는 result.steps에 해당 step이 없으므로 Map.set 자체를 건너뜀
 * → STATEMENT_GROUPS의 'aggregate' 그룹이 빈 itemKeys로 자동 미렌더.
 *
 * 데이터 출처: aggregate.aggregated.steps[] (transfer-tax-aggregate.ts:148/173/216)
 *  - "양도차손 통산 (§102② · 시행령 §167의2)"
 *  - "기본공제"
 *  - "비교과세 (§104⑤)"
 */
export function setAggregateProcedureItems(
  items: Map<string, StatementItem>,
  result: TransferTaxResult,
): void {
  const lossOffsetStep = findStepByLabel(result.steps, "양도차손 통산");
  if (lossOffsetStep) {
    items.set("lossOffset", {
      label: "양도차손 통산",
      value: lossOffsetStep.amount,
      formula:
        lossOffsetStep.formula ??
        "그룹 내 통산 + 타군 pro-rata 안분 (잔여 차손 소멸, 이월 불인정)",
      legalBasis: lossOffsetStep.legalBasis ?? "소득세법 §102② · 시행령 §167의2",
      note: "다건 양도 시 자산별 차손을 다른 자산의 차익과 통산. 잔여 차손은 이월 불인정.",
      summaryOnly: true,
    });
  }

  const basicAggregateStep = findStepByLabel(result.steps, "기본공제");
  if (basicAggregateStep) {
    items.set("basicDeductionAggregate", {
      label: "기본공제 배분 (다건)",
      value: basicAggregateStep.amount,
      formula:
        basicAggregateStep.formula ??
        "연 250만원 한도 자산별 배분 (최고세율이 적용되는 소득에 먼저 배정)",
      legalBasis: basicAggregateStep.legalBasis ?? "소득세법 §103",
      // 🔴 종전 문구는 한국어 문장 속에 내부 플래그 이름 `exempt`와 정책 상수명 `MAX_BENEFIT`을
      //    그대로 노출했다(2026-09-07 대장 재대조 · `feedback_no_internal_id_in_result`).
      note: "미등기 양도·비과세 자산을 제외한 자산 간 한도 배분. 단일 자산은 전액 배정.",
      summaryOnly: true,
    });
  }

  const comparedStep = findStepByLabel(result.steps, "비교과세");
  if (comparedStep) {
    items.set("comparedTaxation", {
      label: "비교과세 (§104⑤)",
      value: comparedStep.amount,
      formula:
        comparedStep.formula ??
        "세율군별 합산세액과 전체누진세액 중 큰 금액 — 중과·단기 세율군 존재 시만",
      legalBasis: comparedStep.legalBasis ?? "소득세법 §104⑤",
      note: "다주택 중과·비사업용토지·단기보유 자산 포함 시 자동 활성화. 두 방법 중 큰 세액 적용 — 감면세액이 있으면 감면세액을 뺀 세액이 더 큰 쪽(§104⑤ 괄호).",
      summaryOnly: true,
    });
  }
}

/**
 * 7단계 부가세·지방세 4개 항목(농특세·지방소득세 산출/감면/결정)을 Map에 추가.
 * 자기완결 — items·result·totalPenalty만 사용(단건·다건 공통).
 */
export function buildSurtaxAndLocalTaxItems(
  items: Map<string, StatementItem>,
  result: TransferTaxResult,
  totalPenalty: number,
  /**
   * 집계(다건·일괄) 모드의 농어촌특별세 — 엔진 2-pass 산정 합계(`aggregated.ruralSurtax`).
   *
   * 집계 어댑터(`aggregateToFilingResult`)는 단건 detail(`new993Detail` 등)을 담지 않아
   * `incomeDeductionRuralSurtax(result)`가 항상 0이 된다. 같은 화면의 신고서 표는
   * `aggregated.ruralSurtax`를 싣고 `aggregated.totalTax`에도 합산돼 있으므로,
   * 넘기지 않으면 명세서만 0으로 어긋난다. 단건은 `undefined`(종전 동작).
   */
  aggregateRuralSurtax?: number,
): void {
  const ruralSurtaxValue = resolveRuralSurtax(result, aggregateRuralSurtax);
  // 산식은 엔진 농특세 단계(세액감면형 「감면세액 × 20%」 / 차감형 「(감면 전 − 감면 후 산출세액) × 20%」)를 그대로 읽는다 — 단계 금액 합이 값과 같을 때만.
  // 단계가 없거나(집계 어댑터 등) 합이 다르면 종전 문구로 대신한다. 값이 0이면 해당 없음이다.
  const ruralSteps = (result.steps ?? []).filter(
    (st) =>
      st.amount > 0 &&
      (st.legalBasis === TRANSFER.RURAL_SURTAX_REDUCTION ||
        st.legalBasis?.startsWith(TRANSFER.RURAL_SURTAX_DEDUCTION) ||
        st.legalBasis?.startsWith(TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27)),
  );
  const ruralFormula =
    ruralSurtaxValue === 0
      ? "해당 없음"
      : ruralSteps.length > 0 && ruralSteps.reduce((n, st) => n + st.amount, 0) === ruralSurtaxValue
      ? ruralSteps.map((st) => st.formula).join("\n")
      : `(감면 전 산출세액 − 감면 후 산출세액) × 20% = ${ruralSurtaxValue.toLocaleString()} (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)`;
  items.set("ruralSurtax", {
    label: "농어촌특별세",
    value: ruralSurtaxValue,
    formula: ruralFormula,
    // 근거는 엔진 농특세 단계(세액감면형 §5①1호 / 차감형 §5①1호·③·시행령 §5②)를 그대로 읽는다 — 단계가 없으면 차감형(US-83)
    legalBasis:
      result.steps?.find((st) => st.legalBasis === TRANSFER.RURAL_SURTAX_REDUCTION || st.legalBasis === TRANSFER.RURAL_SURTAX_DEDUCTION || st.legalBasis === TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27)?.legalBasis ??
      TRANSFER.RURAL_SURTAX_DEDUCTION,
    summaryOnly: true,
  });

  /**
   * 지방소득세 산출세액 — 값은 엔진 `localIncomeTax`, 산식은 §114조의2분으로 쓴다.
   * 종전에는 `totalPenalty`(= §114조의2 + 국기법 §47의2~§47의4)로 값을 다시 계산해
   * 바로 아래 「산출세액 − 감면 0 = 결정세액」이 산술적으로 거짓이 됐다.
   * 축 설명·단일 소스: `local-income-tax-display.ts`.
   */
  const localCalc = result.localIncomeTax;
  items.set("localCalculatedTax", {
    label: "지방소득세 산출세액",
    value: localCalc,
    formula: localCalculatedTaxFormula(result.determinedTax, localTaxablePenaltyOf(result)),
    // 🔴 G-29: §103의3은 **세율** 조항이다. 과세표준은 §103②, §114조의2분 가산은 §103의9②.
    legalBasis: "지방세법 §103② · §103의3 · §103의9②",
    summaryOnly: true,
  });
  items.set("localReduction", {
    label: "지방세 감면세액",
    value: 0,
    formula: "현재 미구현 (지방세 감면 정책 미반영)",
    /**
     * 🔴 종전에는 개인지방소득세 장 전체를 뭉뚱그린 **범위 인용**이었고, 그 시작 조문은
     *   「세율」 — **종합소득·퇴직소득**의 표준세율표라 양도소득분과 무관했다(실측).
     *   양도소득분 개인지방소득세의 세액공제·세액감면 조문은 **§103의4**다:
     *   「양도소득에 대한 개인지방소득세의 세액공제 및 세액감면에 관한 사항은
     *    「지방세특례제한법」에서 정한다」 — §103의3⑥도 그 조문을 감면 근거로 지목한다.
     *   (옛 인용 문자열은 여기 적지 않는다 — 감사 스캐너가 그 주석 자신을 위반으로 잡는다.)
     */
    legalBasis: "지방세법 §103의4",
    summaryOnly: true,
  });
  items.set("localDeterminedTax", {
    label: "지방세 결정세액",
    value: result.localIncomeTax,
    formula: `지방소득세 산출세액 ${localCalc.toLocaleString()} − 지방세 감면세액 0 = ${result.localIncomeTax.toLocaleString()} (원 미만 절사)`,
    /**
     * 🔴 종전에는 **「과세표준」** 조문을 인용해(실측) 「산출세액 − 감면세액」의 근거가
     *   아니었다. 산출세액은 §103의3(세율), 감면은 §103의4(세액공제 및 세액감면)다.
     *   (옛 인용 문자열은 여기 적지 않는다 — 감사 스캐너가 이 주석 자신을 위반으로 잡는다.)
     */
    legalBasis: "지방세법 §103의3·§103의4",
    summaryOnly: true,
  });
  // US-29 — 지방소득세 가산세(지방세기본법 §53~§55). 본세(위 결정세액)와 별도 행이며 총 납부세액에 포함된다.
  const localPenaltyItem = localIncomePenaltyStatementItem(result.localIncomePenalty);
  if (localPenaltyItem) items.set("localIncomePenalty", localPenaltyItem);
}

/**
 * 소득금액차감방식(§90②) 감면대상 산식의 **공용 계약**.
 *
 * §99의3·§99·§98의8·하이브리드 8조문이 모두 「양도소득금액 × (5년시점−취득) ÷ (양도−취득)」
 * 형태를 쓰므로 한 빌더로 처리한다. 다만 **§99만 분모가 다르다**(재개발 변형은 종전주택
 * 취득시 기준시가가 분모) — 그래서 빌더가 조문을 분기하지 않고 **분자·분모·라벨을 인자로 받는다**.
 */
export interface IncomeDeductionFormulaSource {
  /** 조문 표시명 — 산식 꼬리표 (예: "§99의3") */
  articleLabel: string;
  isWithin5Years: boolean;
  reducibleTransferIncome: number;
  transferIncomeApplied?: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /** §99·§99의3 재개발 변형 전용 — 분모의 기준시가(종전주택 취득시) */
  previousHouseStdPriceApplied?: number;
  /** 감면 0의 사유 판별용 — 부호 케이스 */
  signCase?: string;
  /** 하이브리드 전용 echo — 5년 이내 세액감면(tax_amount)·특칙형(lthd_rate_special·flat_rate_20)은 소득금액 차감이 없다 */
  effectCategory?: "tax_amount" | "income_deduction" | "lthd_rate_special" | "flat_rate_20";
  /** 적격 여부 echo — false면 감면 자체가 적용되지 않는다 */
  isEligible?: boolean;
  /** 하이브리드 감면·공제율 echo (§98의3 과밀 0.6 · §98의5 0.6/0.8 · §98의6 0.5 등). 없으면 100% */
  taxReductionRate?: number;
  /** §98의8 공제율 echo (같은 의미 — 필드명만 다르다) */
  deductionRate?: number;
}

/** 감면 0인 이유를 부호 케이스로 풀어쓴다(사용자 요청: 세액이 없어도 과정을 보인다). */
function describeZeroReason(src: IncomeDeductionFormulaSource): string {
  const acq = src.standardPriceAtAcquisition;
  const y5 = src.standardPriceAt5Years;
  const tr = src.standardPriceAtTransfer;
  if (acq != null && y5 != null && y5 <= acq) {
    return "5년이 되는 날의 기준시가가 취득 당시 기준시가보다 낮아 5년간 발생한 양도소득금액이 없다";
  }
  if (acq != null && tr != null && tr <= acq) {
    return "양도 당시 기준시가가 취득 당시 기준시가보다 낮아 안분 분모가 0 이하다";
  }
  return "기준시가 부호 조건을 충족하지 못했다";
}

/**
 * 소득금액 감면대상(§90② 소득금액차감) 산식 — 실제 변수값 인라인 + 분수 Frac 표기(PR #746 표준).
 * 5년 이내 = 전액 차감 / 5년 후 = 양도소득금액 × (5년시점−취득) ÷ (양도−취득) 안분.
 *
 * 감면액이 0이어도 **값이 대입된 산식과 0인 사유를 함께** 보인다 — 결과만 0으로 두면
 * 왜 0인지 화면에서 알 수 없다.
 */
export function buildIncomeDeductionReducibleFormula(
  src: IncomeDeductionFormulaSource,
  income: number,
): ReactNode {
  const reducible = src.reducibleTransferIncome;
  const base = src.transferIncomeApplied ?? income;
  const article = src.articleLabel;
  // 재개발·재건축 변형은 5년 이내 양도도 안분한다(조특령 §99①1호 단서 · §99의3②1호 단서 — NH-66). 변형이 아니면 전액.
  const variant = src.previousHouseStdPriceApplied != null;
  // US-77 — 하이브리드 5년 이내(세액감면)·특칙형·부적격은 소득금액 차감이 없다. 「전액 차감」「5년 안분 결과 0」으로 적지 않는다.
  if (src.effectCategory != null && src.isEligible === false) {
    return `해당 없음 (${article} — 감면 요건을 갖추지 못해 적용하지 않음)`;
  }
  if (src.effectCategory === "tax_amount") {
    return `해당 없음 (${article} — 취득일부터 5년 이내 양도는 세액감면 방식이라 소득금액에서 차감하지 않음)`;
  }
  if (src.effectCategory === "lthd_rate_special" || src.effectCategory === "flat_rate_20") {
    return `해당 없음 (${article} — 장기보유특별공제·세율 특칙으로 5년간 발생분을 소득금액에서 차감하지 않음)`;
  }
  if (src.isWithin5Years && !variant) {
    return `양도소득금액 ${base.toLocaleString()} 전액 차감 (취득 후 5년 이내 양도 — ${article})`;
  }
  const acq = src.standardPriceAtAcquisition;
  // 5년 이내 변형은 분자가 「양도시 − 신축주택 취득시」다 — 5년시점 기준시가를 쓰지 않는다.
  const y5 = src.isWithin5Years ? src.standardPriceAtTransfer : src.standardPriceAt5Years;
  const y5Label = src.isWithin5Years ? "양도시 기준시가" : "5년시점 기준시가";
  const tr = src.standardPriceAtTransfer;
  // echo가 없는 구 저장 이력 — 값 없이 결과만 (graceful fallback)
  if (acq == null || y5 == null || tr == null) {
    return reducible > 0
      ? `양도소득금액 ${base.toLocaleString()} × 5년 안분비율 = ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`
      : `감면 대상 없음 (${article} — 5년 안분 결과 0)`;
  }
  // 분모 — 재개발 변형(§99·§99의3)은 종전주택 취득시 기준시가 (NH-67)
  const denomBase = src.previousHouseStdPriceApplied ?? acq;
  const denomLabel = variant ? "종전주택 취득시" : "취득시";
  const numerator = y5 - acq;
  const denominator = tr - denomBase;
  const frac = createElement(Frac, {
    top: `${y5Label} ${y5.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${numerator.toLocaleString()}`,
    bottom: `양도시 기준시가 ${tr.toLocaleString()} − ${denomLabel} ${denomBase.toLocaleString()} = ${denominator.toLocaleString()}`,
  });
  // 감면 0 — 값은 그대로 보이고 사유를 덧붙인다
  if (reducible <= 0) {
    return createElement(
      Fragment,
      null,
      `양도소득금액 ${base.toLocaleString()} × `,
      frac,
      ` = 0 (${article} — ${describeZeroReason(src)})`,
    );
  }
  // US-78 — 감면·공제율 100% 미만(§98의3 과밀·§98의5·§98의6·§98의8): 「5년간 발생분 × 율 = 공제액」 2단으로 적는다.
  const rate = src.taxReductionRate ?? src.deductionRate ?? 1;
  if (rate < 1 && !src.isWithin5Years) {
    const ratePct = Math.round(rate * 100);
    // 분자 > 0 · 분모 ≤ 0 — 5년간 발생분을 상한 없는 값으로 보아 율 적용 후 양도소득금액 전액 (엔진과 같은 정책)
    if (src.signCase === "pos_neg" || src.signCase === "pos_zero") {
      const why = src.signCase === "pos_zero" ? "양도시 기준시가가 취득시 기준시가와 같아 분모가 0" : "양도시 기준시가가 취득시 기준시가보다 낮아 분모가 음수";
      return `${why}이므로 5년간 발생분 × ${ratePct}%가 양도소득금액 ${base.toLocaleString()}을 넘는 것으로 보아 초과금액은 없는 것으로 하여 ${reducible.toLocaleString()} (${article} §90② 소득금액차감) — ${ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE}`;
    }
    // 5년간 발생분 = 령 §40① 산식 값(양도소득금액 한도 전) — 엔진이 쓴 부호 정책과 같다.
    const fiveYear =
      src.signCase === "all_positive"
        ? Math.max(0, safeMultiplyThenDivide(base, numerator, denominator))
        : 0;
    const applied = applyRate(fiveYear, rate);
    const tail =
      applied > base
        ? ` = ${applied.toLocaleString()}이나 양도소득금액 ${base.toLocaleString()}을 넘는 초과금액은 없는 것으로 하여 ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`
        : ` = ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`;
    return createElement(
      Fragment,
      null,
      `양도소득금액 ${base.toLocaleString()} × `,
      frac,
      ` = 5년간 발생분 ${fiveYear.toLocaleString()} × ${ratePct}%${tail}`,
    );
  }
  // 전액 감면 — 분수 표기가 부적합(비율 ≥ 1)
  if (reducible >= base && src.signCase === "pos_zero") {
    return `양도소득금액 ${base.toLocaleString()} 전액 감면 (${article} — ${ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE})`;
  }
  if (reducible >= base) {
    return `양도소득금액 ${base.toLocaleString()} 전액 감면 (${src.isWithin5Years ? "안분 비율 1 이상" : "양도시 기준시가가 5년시점 이하"} — ${article})`;
  }
  return createElement(
    Fragment,
    null,
    `양도소득금액 ${base.toLocaleString()} × `,
    frac,
    ` = ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`,
  );
}
