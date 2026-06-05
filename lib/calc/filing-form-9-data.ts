/**
 * filing-form-9-data — 별지 제9호서식(앞쪽) 데이터 어댑터 (Option A · 엔진 변경 0)
 *
 * 단일 진실 게이트웨이: `InheritanceTaxResult` + `buildSummaryTable`(이미지2 조립) 만 읽어
 * 양식 칸별 값(values)·계산 표 행(FilingFormRow[])·식별정보 도출(신고인·신고기한)을 산출.
 * 화면(`FilingForm9CoverSection`)·PDF가 이 함수 결과만 소비 → 재계산 0, dual-truth 0.
 *
 * V-2 해소(엔진 inheritance-tax.ts:667-669):
 *   finalTax = computedTax + 세대생략가산 − corporateExemption − totalTaxCredit = ㉔ − ㉗
 *   → ㉗ = totalTaxCredit + corporateExemption. corporate §3의2② 면제는 이미지2 ⑩c→㉙ §28에
 *     포함 표시되므로 ㉟ 면제세액 = 0 (이중계상 방지).
 *
 * Plan: docs/00-pm/inheritance-filing-form-9-replica.plan.md §2
 * Design: docs/02-design/features/inheritance-filing-form-9-replica.ui.design.md §3
 */

import { addMonths, endOfMonth, format, parseISO } from "date-fns";
import type {
  FilingFormRow,
  Heir,
  HeirRelation,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { buildSummaryTable, sortHeirs } from "@/lib/calc/heir-allocation-summary";
import { FF9_CALC_LABELS, FF9_LAW_REFS } from "@/components/calc/inheritance/filing-form-9/filing-form-9-constants";

/** ⑤ 피상속인과의 관계 라벨 (이미지1 child="자" 표기 우선). labelOf(name 우선)는 부적합. */
export const HEIR_RELATION_TO_DECLARANT_LABEL: Record<HeirRelation, string> = {
  spouse: "배우자",
  child: "자",
  lineal_ascendant: "직계존속",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
  corporate: "영리법인",
};

export interface FilingForm9Data {
  /** 박스번호("⑰")→금액. anchor bNN = values["box"]. rows는 이로부터 빌드 */
  values: Record<string, number>;
  /** 계산 표 좌측(⑰~㉞) · 우측(영리법인면제~㊷) — 공용 BesshiColumn 소비 */
  leftRows: FilingFormRow[];
  rightRows: FilingFormRow[];
  /** 신고인 도출 (대표상속인 = sortHeirs[0]) */
  declarant: { name: string; relationLabel: string; residentNumber: string } | null;
  /** ⑦ 피상속인 성명 (Step1 입력, 미입력 "") */
  decedentName: string;
  /** ⑧ 피상속인 주민등록번호 (Step1 입력, 미입력 "") */
  decedentResidentNumber: string;
  /** ⑫ 상속개시일 YYYY-MM-DD (없으면 "") */
  deathDate: string;
  /** ⑪ 상속원인 기본 사망 */
  inheritanceCause: "death";
  /** ㊷ 신고기한 (말일+6개월, 상증법 §67①) — deathDate 없으면 "" */
  filingDueDate: string;
  /** ㊶ 분납기한 (신고기한+2개월, 상증법 §70②) */
  installmentDueDate: string;
  /** C-4 영리법인 유증 면제 발동 여부 */
  hasCorporateExemption: boolean;
  /** 영리법인 유증등 재산가액 (C-4, 현 엔진은 0) */
  corporateBequestValue?: number;
}

/** 금액 행 — 0이면 "—"(dash), 그 외 금액 표시 */
function amtRow(
  num: string,
  amount: number,
  column: "left" | "right",
  opts?: { forceAmount?: boolean; lawRef?: string },
): FilingFormRow {
  return {
    number: num,
    label: FF9_CALC_LABELS[num] ?? num,
    amount,
    display: opts?.forceAmount || amount > 0 ? "amount" : "dash",
    lawRef: opts?.lawRef ?? FF9_LAW_REFS[num],
    column,
  };
}

function headerRow(label: string, column: "left" | "right"): FilingFormRow {
  return { number: "", label, amount: 0, display: "header", column };
}

/**
 * 별지 제9호서식 데이터 조립 — 엔진 result + buildSummaryTable 합계열만 읽음.
 */
export function buildFilingForm9Data(
  result: InheritanceTaxResult,
  heirs: Heir[],
  deathDateInput?: string,
  decedentName?: string,
  decedentResidentNumber?: string,
): FilingForm9Data {
  const summary = buildSummaryTable(result, heirs);
  const rowTotal = (rowId: string): number =>
    summary.rows.find((r) => r.rowId === rowId)?.total ?? 0;

  // ── 좌측 계산값 (result 직접) ──
  const b17 = result.taxableEstateValue;
  const b18 = result.totalDeduction;
  const b19 = result.appraisalFeeDeduction ?? 0; // ⑲ 감정평가수수료 (§25①2호·시행령 §20의3)
  const b20 = result.taxBase;
  const b21Rate = result.computedTaxAppliedRate ?? 0; // 0.5
  const b22 = result.computedTax;
  const b23 = result.generationSkipSurcharge;
  const b24 = b22 + b23;
  // ㉙ §28 = ⑩c(영리법인 사전증여분) + ⑫c(상속인분) — V-2: corporate 면제가 ⑩c로 포함
  const b29 = rowTotal("row-10c-corpCredit") + rowTotal("row-12c-credit");
  const b28 = b29; // ㉘ 소계 = ㉙ + ㉚(0)
  const b33 = rowTotal("row-14-filingCredit"); // ㉝ §69 = ⑭
  const b27 = b28 + b33; // ㉗ 계 = ㉘ + ㉛(0)+㉜(0) + ㉝ + ㉞(0)

  // ── 우측 (V-2: ㉟ 면제세액 = 0, corporate 면제는 ㉙에 표시) ──
  const b35 = 0; // 면제세액 — 이중계상 방지
  // ㉖ §74 징수유예세액 — 납부세액(㊳)에서 차감(결정세액 finalTax는 불변, 재결례 940708)
  const b26 = result.culturalHeritageDeferredTax ?? 0;
  const b43 = result.finalTax - b26; // ㊳ = ㉔ + ㉕ − ㉖ − ㉗

  const values: Record<string, number> = {
    "⑰": b17, "⑱": b18, "⑲": b19, "⑳": b20, "㉑": b21Rate,
    "㉒": b22, "㉓": b23, "㉔": b24, "㉕": 0, "㉖": b26,
    "㉗": b27, "㉘": b28, "㉙": b29, "㉚": 0, "㉛": 0, "㉜": 0, "㉝": b33, "㉞": 0,
    "㉟": b35, "㊱": 0, "㊲": 0, "㊳": b43,
  };

  // ── 좌측 행 ──
  const rateLabel = `${Math.round(b21Rate * 1000) / 10}%`; // 0.5 → "50%"
  const leftRows: FilingFormRow[] = [
    amtRow("⑰", b17, "left", { forceAmount: true }),
    amtRow("⑱", b18, "left", { forceAmount: true }),
    amtRow("⑲", b19, "left"),
    amtRow("⑳", b20, "left", { forceAmount: true }),
    {
      number: "㉑",
      label: FF9_CALC_LABELS["㉑"],
      amount: 0,
      display: "rate",
      formula: rateLabel,
      column: "left",
    },
    amtRow("㉒", b22, "left", { forceAmount: true }),
    amtRow("㉓", b23, "left", { lawRef: FF9_LAW_REFS["㉓"] }),
    amtRow("㉔", b24, "left", { forceAmount: true }),
    amtRow("㉕", 0, "left"),
    amtRow("㉖", b26, "left"),
    amtRow("㉗", b27, "left", { forceAmount: true }),
    amtRow("㉘", b28, "left"),
    amtRow("㉙", b29, "left"),
    amtRow("㉚", 0, "left"),
    amtRow("㉛", 0, "left"),
    amtRow("㉜", 0, "left"),
    amtRow("㉝", b33, "left"),
    amtRow("㉞", 0, "left"),
  ];

  // ── 우측 행 ──
  const dueDates = deriveDueDates(deathDateInput);
  const rightRows: FilingFormRow[] = [
    headerRow(FF9_CALC_LABELS.corporateExemptionTitle, "right"),
    { number: "", label: FF9_CALC_LABELS.bequestValue, amount: 0, display: "dash", column: "right" },
    amtRow("㉟", b35, "right", { lawRef: FF9_LAW_REFS["㉟"] }),
    { number: "", label: FF9_CALC_LABELS.exemptedPayable, amount: 0, display: "dash", column: "right" },
    amtRow("㊱", 0, "right"),
    amtRow("㊲", 0, "right"),
    amtRow("㊳", b43, "right", { forceAmount: true }),
    headerRow(FF9_CALC_LABELS.paymentMethodTitle, "right"),
    amtRow("㊴", 0, "right"),
    amtRow("㊵", 0, "right"),
    {
      number: "㊶",
      label: FF9_CALC_LABELS["㊶"],
      amount: 0,
      display: "dash",
      formula: dueDates.installmentDueDate ? `분납기한 ${dueDates.installmentDueDate}` : undefined,
      column: "right",
    },
    {
      number: "㊷",
      label: FF9_CALC_LABELS["㊷"],
      amount: 0,
      display: "dash",
      formula: dueDates.filingDueDate ? `신고기한 ${dueDates.filingDueDate}` : undefined,
      column: "right",
    },
  ];

  // ── 신고인 도출 ──
  const sorted = sortHeirs(heirs);
  const head = sorted[0];
  const declarant = head
    ? {
        name: head.name?.trim() ?? "",
        relationLabel: HEIR_RELATION_TO_DECLARANT_LABEL[head.relation] ?? "",
        residentNumber: head.residentNumber?.trim() ?? "",
      }
    : null;

  return {
    values,
    leftRows,
    rightRows,
    declarant,
    decedentName: decedentName?.trim() ?? "",
    decedentResidentNumber: decedentResidentNumber?.trim() ?? "",
    deathDate: deathDateInput ? toIsoDate(deathDateInput) : "",
    inheritanceCause: "death",
    filingDueDate: dueDates.filingDueDate,
    installmentDueDate: dueDates.installmentDueDate,
    hasCorporateExemption: (result.corporateExemption?.amount ?? 0) > 0,
    corporateBequestValue: 0,
  };
}

/**
 * 상속개시일 → 신고기한(§67①)·분납기한(§70②) 도출.
 *
 * §67①: "상속개시일이 속하는 달의 말일부터 6개월 이내"
 * 국세기본법 §4 → 민법 준용.
 *
 * 산식: endOfMonth(사망일) → addMonths(+6) → 해당 월 말일 없으면 date-fns 자동 보정.
 * 세무행정 실무 표준 (예: 3/15 사망 → 3/31 기산 → 9/30 신고기한).
 *
 * 민법 §160②·③ 엄격 해석("기산일에 해당한 날의 전일")과는 edge에서 하루 차이가 있을 수 있으나,
 * 국세청 실무 및 기존 anchor(FB-07~09)와 일치하므로 현행 유지.
 * 외국 거주 시 9개월(§67④): 별도 처리 필요(현재 미구현).
 */
function deriveDueDates(deathDate?: string): {
  filingDueDate: string;
  installmentDueDate: string;
} {
  if (!deathDate) return { filingDueDate: "", installmentDueDate: "" };
  const base = parseISO(deathDate);
  if (isNaN(base.getTime())) return { filingDueDate: "", installmentDueDate: "" };
  const filing = addMonths(endOfMonth(base), 6); // 말일 + 6개월
  const installment = addMonths(filing, 2); // 신고기한 + 2개월
  return {
    filingDueDate: format(filing, "yyyy-MM-dd"),
    installmentDueDate: format(installment, "yyyy-MM-dd"),
  };
}

function toIsoDate(d: string): string {
  const parsed = parseISO(d);
  return isNaN(parsed.getTime()) ? d : format(parsed, "yyyy-MM-dd");
}
