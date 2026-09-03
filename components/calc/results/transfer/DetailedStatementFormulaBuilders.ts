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

/**
 * 양도소득금액 = 과세대상양도차익 − 장특공제 (음수 가능 — 차손).
 *
 * 🔴 이 항목이 **표시하는 값은 `incomeAfterOffset`(§102② 차손 통산 後)** 인데 종전 산식은
 *   `p.income`(통산 前)에서 끝났다. 차손이 섞인 다건에서 「490,000,000 - 98,000,000 =
 *   392,000,000」이라 적어놓고 옆에는 342,000,000을 찍어 **좌변이 우변을 만들지 못했다**
 *   (결과탭 코드리뷰 #072). 통산 단계를 산식에 드러낸다.
 */
export function buildIncomeFormula(p: PerPropertyBreakdown): string {
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = tg > 0 ? Math.min(tg, inc + lth) : tg;
  const base = `${fmt(taxable)} - ${fmt(lth)} = ${fmt(p.income)}`;
  if (p.income === p.incomeAfterOffset) return base;
  const received = p.lossOffsetFromSameGroup + p.lossOffsetFromOtherGroup;
  // 차손을 **받은** 자산: 통산액이 자기 필드에 실린다.
  if (received > 0) return `${base} − 결손금 통산 ${fmt(received)} = ${fmt(p.incomeAfterOffset)}`;
  // 차손을 **낸** 자산: 통산액은 상대 자산 쪽에 실리므로 결과만 밝힌다.
  return `${base} → 다른 자산의 양도소득금액에 통산되어 ${fmt(p.incomeAfterOffset)}`;
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

/**
 * 가산세액 = 「소득세법」 §114조의2 + 「국세기본법」 §47의2~§47의4 신고불성실·납부지연.
 *
 * 🔴 G-38: 법령명 없이 「§114의2」로 적으면 어느 법의 조문인지 화면에서 알 수 없고,
 * 같은 화면의 다른 행이 쓰는 「§114조의2」와 조 표기까지 갈린다.
 */
export function buildPenaltyFormula(p: PerPropertyBreakdown): string {
  const parts: string[] = [];
  if (p.penaltyTax > 0) parts.push(`소득세법 §114조의2 ${fmt(p.penaltyTax)}`);
  if (p.filingDelayedPenaltyTax > 0)
    parts.push(`국세기본법 §47의2~§47의4 신고불성실·납부지연 ${fmt(p.filingDelayedPenaltyTax)}`);
  if (parts.length === 0) return "가산세 없음";
  return `${parts.join(" + ")} = ${fmt(p.penaltyTax + p.filingDelayedPenaltyTax)}`;
}

// ── 다건 합산 절차 항목 빌더 (다건 모드 전용) ─────────────────────────

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { StatementItem } from "./DetailedStatementHelpers";
import { findStepByLabel } from "./DetailedStatementHelpers";
import { resolveRuralSurtax } from "./reduction-eligible-income";
import {
  localCalculatedTaxFormula,
  localTaxablePenaltyOf,
} from "@/components/calc/results/transfer/local-income-tax-display";

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
  const ruralSurtaxValue = resolveRuralSurtax(result, aggregateRuralSurtax);
  items.set("ruralSurtax", {
    label: "농어촌특별세",
    value: ruralSurtaxValue,
    formula: `(감면 전 산출세액 − 감면 후 산출세액) × 20% = ${ruralSurtaxValue.toLocaleString()} (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)`,
    legalBasis: "농어촌특별세법 §3·§5",
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
  /** §99 재개발 변형 전용 — 분모의 기준시가(종전주택 취득시) */
  previousHouseStdPriceApplied?: number;
  /** 감면 0의 사유 판별용 — 부호 케이스 */
  signCase?: string;
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
  if (src.isWithin5Years) {
    return `양도소득금액 ${base.toLocaleString()} 전액 차감 (취득 후 5년 이내 양도 — ${article})`;
  }
  const acq = src.standardPriceAtAcquisition;
  const y5 = src.standardPriceAt5Years;
  const tr = src.standardPriceAtTransfer;
  // echo가 없는 구 저장 이력 — 값 없이 결과만 (graceful fallback)
  if (acq == null || y5 == null || tr == null) {
    return reducible > 0
      ? `양도소득금액 ${base.toLocaleString()} × 5년 안분비율 = ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`
      : `감면 대상 없음 (${article} — 5년 안분 결과 0)`;
  }
  // 분모는 조문별로 다르다 — §99 재개발 변형만 종전주택 취득시 기준시가
  const denomBase = src.previousHouseStdPriceApplied ?? acq;
  const denomLabel = src.previousHouseStdPriceApplied != null ? "종전주택 취득시" : "취득시";
  const numerator = y5 - acq;
  const denominator = tr - denomBase;
  const frac = createElement(Frac, {
    top: `5년시점 기준시가 ${y5.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${numerator.toLocaleString()}`,
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
  // 전액 감면 — 분수 표기가 부적합(비율 ≥ 1)
  if (reducible >= base) {
    return `양도소득금액 ${base.toLocaleString()} 전액 감면 (양도시 기준시가가 5년시점 이하 — ${article})`;
  }
  return createElement(
    Fragment,
    null,
    `양도소득금액 ${base.toLocaleString()} × `,
    frac,
    ` = ${reducible.toLocaleString()} (${article} §90② 소득금액차감)`,
  );
}

/**
 * §99의3 전용 래퍼 — 기존 호출부 유지용. 공용 빌더에 위임한다.
 */
export function buildNew993ReducibleFormula(
  detail: NonNullable<TransferTaxResult["new993Detail"]>,
  income: number,
): ReactNode {
  return buildIncomeDeductionReducibleFormula(
    { ...detail, articleLabel: "§99의3" },
    income,
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
    /**
     * ⑦ §164⑧ 동일조정기간 환산 고지.
     *
     * 분모(양도당시 기준시가)가 **입력값이 아니라 환산값**일 때 그 사실을 밝힌다. 없으면
     * 사용자가 입력한 기준시가와 산식의 분모가 달라 보여 오류로 오해한다.
     *
     * 🔑 이 빌더는 상세 계산 명세서 카드가 쓰고, 그 카드는 **양도세 결과뷰 4개 전부**가
     *    렌더한다(TransferTaxResultView · BundledAllocationCard · MultiTransferTaxResultView ·
     *    MixedUseResultCard) — 여기 한 곳이면 네 경로 모두 도달한다.
     */
    const sapApplied = result.steps?.some(
      (s) => s.label.includes("동일조정기간") && !s.label.includes("미적용"),
    );
    const sapNote = sapApplied
      ? " ※ 분모의 양도당시 기준시가는 보유기간 중 새 기준시가가 고시되지 않아 시행령 §164⑧·시행규칙 §80①에 따라 환산한 값입니다"
      : "";
    return stdAcq != null && stdTransfer != null
      ? estFrac(
          `환산취득가 ${estBase} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
          stdAcq,
          stdTransfer,
          `${capExStr} — 시행령 §163·§176의2②${swapNote}${sapNote}`,
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
