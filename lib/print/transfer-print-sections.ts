/**
 * 계산 결과 선택 출력 — 양도세(단일 자산) 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.5
 * 단일 진실: 결과뷰(TransferTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * PR-F1: 기존 printScoped(body[data-print-scope] CSS scope) → PrintSelectionPanel 통일.
 *   printScoped scope 5종(form-table·detailed-statement·calculation·phd·split-detail)이 leaf.
 *   ⚠️ printScoped와 PrintSection(print:hidden)은 공존 불가(미선택 시 scope 인쇄 무효) → printScoped 완전 제거.
 *
 * pdf 채널 = calculation(핵심 결과 + 계산 내역) 1종.
 *   ResultPdfDocument TransferSection이 계산 내역 흐름 렌더(신고서식·명세서·PHD·분할은 화면 인쇄로만, 검토 U1).
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

/** 선택 가능 leaf 5종 (printScoped scope → leaf, exact 매칭) */
export type TransferPrintSectionId =
  | "form-table"
  | "detailed-statement"
  | "calculation"
  | "phd"
  | "split-detail"
  | "gift-filing-form"
  | "building-std-report";

/** 양도세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type TransferPrintSectionNode = GenericNode<TransferPrintSectionId>;
export type TransferPrintSectionGroup = GenericGroup<TransferPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2.5 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const TRANSFER_PRINT_SECTIONS: TransferPrintSectionGroup[] = [
  {
    id: "group:forms",
    label: "신고서식",
    children: [
      { id: "form-table", label: "신고서 양식 표", channel: SCREEN },
      { id: "detailed-statement", label: "계산결과 상세명세서", channel: SCREEN },
    ],
  },
  {
    id: "group:calc",
    label: "계산 내역",
    children: [
      // 서버 PDF: ResultPdfDocument 양도세 계산 내역(TransferSection)으로 표현 가능 → pdf 채널
      { id: "calculation", label: "핵심 결과·계산 내역", channel: SCREEN_PDF },
      { id: "phd", label: "개별주택가격 미공시 환산", channel: SCREEN },
      { id: "split-detail", label: "토지/건물 분리 양도차익", channel: SCREEN },
      // 부담부증여 무상이전분의 증여세 신고서. 화면 순서(기준시가 계산서 바로 위)와 트리 순서를 맞춘다.
      // channel이 SCREEN인 이유: PDF 페이지 컴포넌트(FilingForm10PdfPage)는 이미 있으나
      // 양도세 PDF 파이프라인(ResultPdfDocument)에 배선하는 것은 별건이다(계획서 §9).
      { id: "gift-filing-form", label: "증여세 신고서 양식 (별지 제10호)", channel: SCREEN },
      { id: "building-std-report", label: "건물 기준시가 계산서", channel: SCREEN_PDF },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 TRANSFER_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (inheritance/gift/acquisition/property/comprehensive-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: TransferPrintSectionGroup[] = TRANSFER_PRINT_SECTIONS
): TransferPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (calculation 1종) */
export function pdfEligibleIds(
  groups: TransferPrintSectionGroup[] = TRANSFER_PRINT_SECTIONS
): TransferPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: TransferPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-F1) — 선택 ∩ pdf 채널 ∩ (가용).
 * 양도세 전용 래퍼 (groups=TRANSFER 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): TransferPrintSectionId[] {
  return selectPdfGeneric(TRANSFER_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: TransferPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
