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
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

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
import { fmt } from "./DetailedStatementGbFormulas";

// ── 단순 산식 (자산별 동일 산식) ──────────────────────────────────

/** 양도차익 = 양도가액 − 취득가액 − 필요경비 */
export function buildSubGainFormula(p: PerPropertyBreakdown): string {
  const displayAcq = p.acquisitionPrice + p.capitalExpenditureForDisplay;
  const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);
  return `${fmt(p.transferPrice)} - ${fmt(displayAcq)} - ${fmt(displayExp)} = ${fmt(p.transferGain)}`;
}

/** 과세대상 양도차익 = min(전체양도차익, max(0, income) + 장특공제) */
export function buildTaxableGainFormula(p: PerPropertyBreakdown): string {
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  if (tg <= 0) return `차손 자산 — 양도차익 ${fmt(tg)} (음수)`;
  const sum = inc + lth;
  return `min(양도차익 ${fmt(tg)}, 양도소득금액 ${fmt(inc)} + 장특공제 ${fmt(lth)} = ${fmt(sum)}) = ${fmt(Math.min(tg, sum))}`;
}

/** 장특공제 = 과세대상양도차익 × 율 */
export function buildLthFormula(p: PerPropertyBreakdown): string {
  if (p.longTermHoldingDeduction === 0) {
    return p.transferGain <= 0 ? "차손 자산 — 장특공제 미적용" : "보유 3년 미만 또는 비적용 자산";
  }
  // 과세대상양도차익 추정 (다건은 정확값 노출 없음 — taxable = min(tg, income+lth))
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = tg > 0 ? Math.min(tg, inc + lth) : tg;
  if (taxable <= 0) return `장특공제 ${fmt(lth)}`;
  const ratePct = ((lth / taxable) * 100).toFixed(1).replace(/\.0$/, "");
  return `과세대상양도차익 ${fmt(taxable)} × ${ratePct}% = ${fmt(lth)}`;
}

/** 양도소득금액 = 과세대상양도차익 − 장특공제 (음수 가능 — 차손) */
export function buildIncomeFormula(p: PerPropertyBreakdown): string {
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = tg > 0 ? Math.min(tg, inc + lth) : tg;
  return `${fmt(taxable)} - ${fmt(lth)} = ${fmt(p.income)}`;
}

/** 산출세액(참고) = 그룹 과세표준 기여분 × (적용세율 + 중과세율) − 누진공제 */
export function buildCalculatedTaxFormula(p: PerPropertyBreakdown): string {
  const ratePct = ((p.appliedRate + (p.surchargeRate ?? 0)) * 100).toFixed(1).replace(/\.0$/, "");
  return `${fmt(p.taxBaseShare)} × ${ratePct}% - ${fmt(p.progressiveDeduction)} = ${fmt(p.refCalculatedTax)}`;
}

/** 결정세액 = 산출세액 − 감면 (자산별 참고값) */
export function buildDeterminedTaxFormula(p: PerPropertyBreakdown): string {
  if (p.reductionAggregated > 0) {
    return `${fmt(p.refCalculatedTax)} - ${fmt(p.reductionAggregated)} = ${fmt(p.refDeterminedTax)}`;
  }
  return `${fmt(p.refCalculatedTax)} (감면 없음)`;
}

/** 가산세액 = §114조의2 + 신고불성실·납부지연 */
export function buildPenaltyFormula(p: PerPropertyBreakdown): string {
  const parts: string[] = [];
  if (p.penaltyTax > 0) parts.push(`§114의2 ${fmt(p.penaltyTax)}`);
  if (p.filingDelayedPenaltyTax > 0) parts.push(`신고/납부지연 ${fmt(p.filingDelayedPenaltyTax)}`);
  if (parts.length === 0) return "가산세 없음";
  return `${parts.join(" + ")} = ${fmt(p.penaltyTax + p.filingDelayedPenaltyTax)}`;
}

// ── 다건 합산 절차 항목 빌더 (다건 모드 전용) ─────────────────────────

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { StatementItem } from "./DetailedStatementHelpers";
import { findStepByLabel } from "./DetailedStatementHelpers";
import { incomeDeductionRuralSurtax } from "./reduction-eligible-income";

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
        "연 250만원 한도 자산별 배분 (MAX_BENEFIT 정책 — 세부담 최소 자산 우선)",
      legalBasis: basicAggregateStep.legalBasis ?? "소득세법 §103",
      note: "유자격 자산(미등기·exempt 제외) 간 한도 배분. 단일 자산은 전액 배정.",
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
        "MAX(세율군별 합산세액, 전체누진세액) — 중과·단기 세율군 존재 시만",
      legalBasis: comparedStep.legalBasis ?? "소득세법 §104⑤",
      note: "다주택 중과·비사업용토지·단기보유 자산 포함 시 자동 활성화. 두 방법 중 큰 세액 적용.",
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
  const ruralSurtaxValue = aggregateRuralSurtax ?? incomeDeductionRuralSurtax(result);
  items.set("ruralSurtax", {
    label: "농어촌특별세",
    value: ruralSurtaxValue,
    formula: `(감면 전 산출세액 − 감면 후 산출세액) × 20% = ${ruralSurtaxValue.toLocaleString()} (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)`,
    legalBasis: "농어촌특별세법 §3·§5",
    summaryOnly: true,
  });

  const localCalc = Math.floor((result.determinedTax + totalPenalty) * 0.1);
  items.set("localCalculatedTax", {
    label: "지방소득세 산출세액",
    value: localCalc,
    formula: `(결정세액 ${result.determinedTax.toLocaleString()} + 가산세 ${totalPenalty.toLocaleString()}) × 10%`,
    legalBasis: "지방세법 §103의3",
    summaryOnly: true,
  });
  items.set("localReduction", {
    label: "지방세 감면세액",
    value: 0,
    formula: "현재 미구현 (지방세 감면 정책 미반영)",
    legalBasis: "지방세법 §92~§103",
    summaryOnly: true,
  });
  items.set("localDeterminedTax", {
    label: "지방세 결정세액",
    value: result.localIncomeTax,
    formula: `지방소득세 산출세액 ${localCalc.toLocaleString()} − 지방세 감면세액 0 = ${result.localIncomeTax.toLocaleString()} (원 미만 절사)`,
    legalBasis: "지방세법 §103",
    summaryOnly: true,
  });
}

/**
 * §99의3 소득금액 감면대상(§90② 소득금액차감) 산식 — 실제 변수값 인라인 + 분수 Frac 표기(PR #746 표준).
 * 5년 이내 = 전액 차감 / 5년 후 = 양도소득금액 × (5년시점−취득) ÷ (양도−취득) 안분.
 * 부호 케이스(양도시 기준시가 하락 등)로 전액·0 감면인 경우는 Frac 대신 서술.
 */
export function buildNew993ReducibleFormula(
  detail: NonNullable<TransferTaxResult["new993Detail"]>,
  income: number,
): ReactNode {
  const reducible = detail.reducibleTransferIncome;
  const base = detail.transferIncomeApplied ?? income;
  // 5년 이내 양도 — 양도소득금액 전액 차감
  if (detail.isWithin5Years) {
    return `양도소득금액 ${base.toLocaleString()} 전액 차감 (취득 후 5년 이내 양도 — 조특법 §99의3)`;
  }
  if (reducible <= 0) {
    return "감면 대상 없음 (5년시점·양도시 기준시가 부호 조건 미충족 — 재산 2014-2035)";
  }
  const acq = detail.standardPriceAtAcquisition;
  const y5 = detail.standardPriceAt5Years;
  const tr = detail.standardPriceAtTransfer;
  if (acq == null || y5 == null || tr == null) {
    return `양도소득금액 ${base.toLocaleString()} × 5년 안분비율 = ${reducible.toLocaleString()} (§99의3 §90② 소득금액차감)`;
  }
  // 전액 감면(양도시 기준시가 하락 등) — 분수 표기 부적합
  if (reducible >= base) {
    return `양도소득금액 ${base.toLocaleString()} 전액 감면 (양도시 기준시가가 5년시점 이하 — 조특법 §99의3)`;
  }
  const numerator = y5 - acq;
  const denominator = tr - acq;
  return createElement(
    Fragment,
    null,
    `양도소득금액 ${base.toLocaleString()} × `,
    createElement(Frac, {
      top: `5년시점 기준시가 ${y5.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${numerator.toLocaleString()}`,
      bottom: `양도시 기준시가 ${tr.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${denominator.toLocaleString()}`,
    }),
    ` = ${reducible.toLocaleString()} (§99의3 §90② 소득금액차감)`,
  );
}

/**
 * 취득가액 산식 — 단건은 실제 변수값(양도차익 항목과 동일 표기), 다건은 자산별 합계 요약.
 * 환산취득가 모드는 기준시가 비율식까지 풀어쓰되, 기준시가 echo가 없는
 * 감정가액·매매사례가액 모드는 추계 취득가액만 표시(비율식 부적용).
 */
export function buildAcquisitionPriceFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  totalTransferPrice: number,
  singleAcq: number,
  capEx: number,
): ReactNode {
  const capExStr = capEx > 0 ? ` + 자본적지출 ${capEx.toLocaleString()}` : "";
  // 환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가) — 분수를 Frac로 표기 (PR #746 표준).
  const estFrac = (prefix: string, stdAcq: number, stdTransfer: number, suffix: string): ReactNode =>
    createElement(
      Fragment,
      null,
      prefix,
      createElement(Frac, {
        top: `취득시 기준시가 ${stdAcq.toLocaleString()}`,
        bottom: `양도시 기준시가 ${stdTransfer.toLocaleString()}`,
      }),
      suffix,
    );
  if (isAggregate) {
    return result.usedEstimatedAcquisition
      ? "자산별 환산취득가 합계 — 시행령 §163·§176의2②"
      : "자산별 실제 거래가액 합계 (자본적지출 §97① 가목 합산)";
  }
  // 배우자등 이월과세 Scenario A 채택 — 증여자 취득 당시 취득가액 승계 (§97의2①).
  // 환산+증여세 경로에서는 엔진이 실가로 전환하므로 result.usedEstimatedAcquisition만으로는
  // 환산 여부를 알 수 없어 scenarioA echo를 사용한다.
  const coA = result.carryoverTaxationDetail;
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const donorCapexNote =
      a.donorCapexAddedToExpense > 0
        ? ` (증여자 자본적지출 ${a.donorCapexAddedToExpense.toLocaleString()} 포함 §97의2①2호)`
        : "";
    if (a.acquisitionWasEstimated) {
      const stdAcq = a.estimatedStdPriceAtAcquisition;
      const stdTransfer = a.estimatedStdPriceAtTransfer;
      return stdAcq != null && stdTransfer != null
        ? estFrac(
            `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
            stdAcq,
            stdTransfer,
            `${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계·시행령 §163⑨)`,
          )
        : `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)}${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계·환산)`;
    }
    return `증여자 취득 당시 취득가액 ${fmt(a.acquisitionPrice)}${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계)`;
  }
  if (result.usedEstimatedAcquisition) {
    const estBase = (result.estimatedBase ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    const stdTransfer = result.estimatedStdPriceAtTransfer;
    /**
     * §97② 2호 단서 swap 채택 시 **이 금액은 양도차익에서 차감되지 않는다**
     * (필요경비 전체가 나목 = 자본적지출 + 양도비. `transfer-tax-helpers.ts` `swap_to_direct`).
     * 고지가 없으면 취득가액·필요경비·양도차익 세 행이 나란히 놓였을 때 산술이 안 맞아 보인다
     * (실측: 10억 − 1억 − 4억 = 5억인데 양도차익은 6억). 양도차익 산식 자체는 엔진 step이
     * 「양도가 − 필요경비」로 정확히 적고 있으므로, 여기서는 **차감 제외 사실만** 덧붙인다.
     */
    const swapNote = result.swapApplied
      ? " ※ §97②2호 단서 적용 — 이 금액은 차감되지 않습니다(필요경비 전체가 자본적지출+양도비)"
      : "";
    return stdAcq != null && stdTransfer != null
      ? estFrac(
          `환산취득가 ${estBase} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
          stdAcq,
          stdTransfer,
          `${capExStr} — 시행령 §163·§176의2②${swapNote}`,
        )
      : `취득가액(추계) ${estBase}${capExStr} — 소득세법 §97 / 시행령 §163·§176의2${swapNote}`;
  }
  return `취득가액 ${(singleAcq - capEx).toLocaleString()}${capExStr} (실제 거래가액)`;
}

/**
 * 필요경비 산식 — 단건은 실제 변수값. 환산모드 본문은 개산공제(취득시 기준시가 × 3%),
 * §97② 단서 swap 시 직접경비(양도비), 실거래는 양도비 합계.
 */
export function buildNecessaryExpenseFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  singleExp: number,
): string {
  if (isAggregate) {
    return result.usedEstimatedAcquisition
      ? "자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥"
      : "자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목";
  }
  // 배우자등 이월과세 Scenario A 채택 — 필요경비 = 양도비 등 + 증여세 상당액(§163의2).
  // singleExp = result.expenses − capEx = (양도비 등) + 증여세 상당액 (실가 전환 후 directSide 반영).
  const coA = result.carryoverTaxationDetail;
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const gift = a.giftTaxAddedToExpense;
    const baseExp = Math.max(0, singleExp - gift);
    // 증여자 취득이 환산(estimated) 모드면 본문 필요경비는 실제 양도비가 아니라
    // 개산공제(취득시 기준시가 × 3%, 시행령 §163⑥)다.
    //
    // ⚠️ 종전에는 **금액 자기일치**(`baseExp === floor(기준시가 × 3%)`)로 이를 역추론했다.
    //    UI가 §163⑥ 산식을 재구현하는 dual-truth였고, 공유지분 축소처럼 등식이 깨지는 변경이
    //    들어오면 개산공제를 "양도비 등"으로 **성격 자체를 오표시**한다.
    //    → 엔진 echo(`necessaryExpenseIsLumpDeduction`)로 판정하고, 산식 base도
    //      엔진이 실제로 쓴 값(`lumpDeductionBase` = 지분 기준시가)을 노출한다.
    const stdAcq = a.estimatedStdPriceAtAcquisition;
    const lumpBase = a.lumpDeductionBase ?? stdAcq;
    const isLumpDeduction = a.necessaryExpenseIsLumpDeduction === true && lumpBase != null;
    const baseLabel = isLumpDeduction
      ? `개산공제 ${baseExp.toLocaleString()} = 취득시 기준시가 ${lumpBase!.toLocaleString()} × 3% — 시행령 §163⑥`
      : `양도비 등 ${baseExp.toLocaleString()} (중개수수료·법무사 비용 등) — §97① 나목`;
    const parts: string[] = [baseLabel];
    if (gift > 0) {
      const limitNote = a.giftTaxLimitApplied
        ? ` (한도 ${a.giftTaxLimitCap.toLocaleString()} = 증여세 가산 전 양도차익 적용)`
        : "";
      parts.push(`증여세 상당액 ${gift.toLocaleString()}${limitNote} — 이월과세 §97의2①3호·시행령 §163의2②`);
    }
    const guardNote = a.donorCapexGuardApplied
      ? " ※ 양도일 2024-01-01 전 — 증여자 자본적지출 불산입(§97의2①2호 시행일)"
      : "";
    const body = parts.length > 1 ? `${parts.join(" + ")} = ${fmt(singleExp)}` : parts[0];
    return body + guardNote;
  }
  if (result.usedEstimatedAcquisition) {
    if (result.swapApplied) {
      return `양도비 ${singleExp.toLocaleString()} (§97② 단서 적용 — 자본적지출은 취득가액에 합산 표시)`;
    }
    const ded = (result.estimatedDeduction ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    return stdAcq != null
      ? `개산공제 ${ded} = 취득시 기준시가 ${stdAcq.toLocaleString()} × 3% — 소득세법 §97① 나목·시행령 §163⑥`
      : `개산공제 ${ded} (취득시 기준시가 × 3%) — §97① 나목·시행령 §163⑥`;
  }
  return `양도비 ${singleExp.toLocaleString()} (중개수수료·법무사 비용 등) — §97① 나목`;
}
