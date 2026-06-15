/**
 * 계산 결과 선택 출력 — 종합부동산세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.4
 * 단일 진실: 결과뷰(ComprehensiveTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * pdf 채널 = housing-tax(주택분 계산표 대표) 1종.
 *   ComprehensiveSection(ResultPdfDocument)은 주택분 계산표만 렌더(토지분 PDF 없음, 검토 U1).
 *   토지분(종합합산·별도합산)은 화면 인쇄로만. 별지 없음.
 */

import {
  type PrintChannel,
  type PrintSectionNode as GenericNode,
  type PrintSectionGroup as GenericGroup,
  type GroupCheckState,
  flattenPrintSectionIds as flattenGeneric,
  pdfEligibleIds as pdfEligibleGeneric,
  selectPdfSections as selectPdfGeneric,
  resolveGroupCheckState as resolveGroupGeneric,
  resolvePrintVisibilityClass as resolveVisibilityGeneric,
} from "@/lib/print/print-sections.types";

export type { PrintChannel, GroupCheckState };

/** 선택 가능 leaf 11종 (오타 방지·exact 매칭) */
export type ComprehensivePrintSectionId =
  | "aggregation-exclusion"
  | "housing-tax-base"
  | "housing-tax"
  | "aggregate-land"
  | "separate-land"
  | "grand-total"
  | "warnings"
  | "filing-form-main"
  | "filing-form-buppyo3"
  | "filing-form-buppyo5"
  | "filing-form-buppyo5sub"
  | "housing-payable-calc"
  | "land-agg-payable-calc"
  | "land-sep-payable-calc";

/** 종부세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type ComprehensivePrintSectionNode = GenericNode<ComprehensivePrintSectionId>;
export type ComprehensivePrintSectionGroup = GenericGroup<ComprehensivePrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2.4 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const COMPREHENSIVE_PRINT_SECTIONS: ComprehensivePrintSectionGroup[] = [
  {
    id: "group:exclusion",
    label: "합산배제 자료",
    children: [
      { id: "aggregation-exclusion", label: "합산배제 적용 내역", channel: SCREEN },
    ],
  },
  {
    id: "group:housing",
    label: "주택분",
    children: [
      { id: "housing-tax-base", label: "주택분 과세표준", channel: SCREEN },
      // 서버 PDF: ResultPdfDocument 종부세 주택분 계산표(ComprehensiveSection)로 표현 가능 → pdf 채널
      { id: "housing-tax", label: "주택분 세액 계산", channel: SCREEN_PDF },
    ],
  },
  {
    id: "group:land",
    label: "토지분 (화면 인쇄 전용)",
    children: [
      { id: "aggregate-land", label: "토지분 종합합산 (§11)", channel: SCREEN },
      { id: "separate-land", label: "토지분 별도합산 (§12)", channel: SCREEN },
    ],
  },
  {
    id: "group:total",
    label: "합계",
    children: [
      { id: "grand-total", label: "최종 합계", channel: SCREEN },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "warnings", label: "경고", channel: SCREEN },
    ],
  },
  {
    id: "group:filing-forms",
    label: "신고서 서식 (2022년판)",
    children: [
      {
        id: "filing-form-main",
        label: "종합부동산세 신고서",
        channel: SCREEN,
      },
      {
        id: "filing-form-buppyo3",
        label: "과세표준 계산명세서 (별지 3호서식 부표)",
        channel: SCREEN,
      },
      {
        id: "filing-form-buppyo5",
        label: "세부담상한초과세액 계산명세서 (별지 5호서식)",
        channel: SCREEN,
      },
      {
        id: "filing-form-buppyo5sub",
        label: "직전연도 종합부동산세상당액 계산서 (부표)",
        channel: SCREEN,
      },
    ],
  },
  {
    id: "group:payable-calc",
    label: "산출 근거",
    children: [
      {
        id: "housing-payable-calc",
        label: "주택분 종합부동산세 납부할 세액 산출 근거",
        channel: SCREEN,
      },
      {
        id: "land-agg-payable-calc",
        label: "종합합산토지분 종합부동산세 납부할 세액 산출 근거",
        channel: SCREEN,
      },
      {
        id: "land-sep-payable-calc",
        label: "별도합산토지분 종합부동산세 납부할 세액 산출 근거",
        channel: SCREEN,
      },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 COMPREHENSIVE_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (inheritance/gift/acquisition/property-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: ComprehensivePrintSectionGroup[] = COMPREHENSIVE_PRINT_SECTIONS
): ComprehensivePrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (housing-tax 1종) */
export function pdfEligibleIds(
  groups: ComprehensivePrintSectionGroup[] = COMPREHENSIVE_PRINT_SECTIONS
): ComprehensivePrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: ComprehensivePrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-E) — 선택 ∩ pdf 채널 ∩ (가용).
 * 종부세 전용 래퍼 (groups=COMPREHENSIVE 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): ComprehensivePrintSectionId[] {
  return selectPdfGeneric(COMPREHENSIVE_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: ComprehensivePrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
