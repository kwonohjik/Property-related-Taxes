/**
 * 계산 결과 선택 출력 — 취득세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.2
 * 단일 진실: 결과뷰(AcquisitionTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * pdf 채널 = tax-detail(계산표 대표) 1종.
 *   AcquisitionSection(ResultPdfDocument)은 단일 계산표 → 분리 경계 없음(검토 U1).
 *   별지 없음. 비과세(isExempt)는 전용 화면 → 선택 트리 비대상(결과뷰 early return).
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
export type AcquisitionPrintSectionId =
  | "deemed-acquisition"
  | "tax-info"
  | "tax-detail"
  | "surtax-detail"
  | "reduction-panel"
  | "surcharge-detail"
  | "house-count"
  | "installment"
  | "steps"
  | "warnings"
  | "legal-basis";

/** 취득세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type AcquisitionPrintSectionNode = GenericNode<AcquisitionPrintSectionId>;
export type AcquisitionPrintSectionGroup = GenericGroup<AcquisitionPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2.2 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const ACQUISITION_PRINT_SECTIONS: AcquisitionPrintSectionGroup[] = [
  {
    id: "group:summary",
    label: "계산 요약",
    children: [
      { id: "deemed-acquisition", label: "간주취득 판정", channel: SCREEN },
      { id: "tax-info", label: "과세 정보 요약", channel: SCREEN },
      // 서버 PDF: ResultPdfDocument 취득세 계산표(AcquisitionSection)로 표현 가능 → pdf 채널
      { id: "tax-detail", label: "세액 상세 명세", channel: SCREEN_PDF },
      { id: "surtax-detail", label: "부가세 상세", channel: SCREEN },
    ],
  },
  {
    id: "group:analysis",
    label: "분석 (간주취득 시 제외)",
    children: [
      { id: "reduction-panel", label: "감면·배제 가능성", channel: SCREEN },
      { id: "surcharge-detail", label: "중과 사유·배제·특례", channel: SCREEN },
      { id: "house-count", label: "실효 주택 수·검산", channel: SCREEN },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "installment", label: "연부취득 신고 일정", channel: SCREEN },
      { id: "steps", label: "계산 과정", channel: SCREEN },
      { id: "warnings", label: "유의사항", channel: SCREEN },
      { id: "legal-basis", label: "적용 법령", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 ACQUISITION_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (inheritance/gift-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: AcquisitionPrintSectionGroup[] = ACQUISITION_PRINT_SECTIONS
): AcquisitionPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (tax-detail 1종) */
export function pdfEligibleIds(
  groups: AcquisitionPrintSectionGroup[] = ACQUISITION_PRINT_SECTIONS
): AcquisitionPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: AcquisitionPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-C) — 선택 ∩ pdf 채널 ∩ (가용).
 * 취득세 전용 래퍼 (groups=ACQUISITION 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): AcquisitionPrintSectionId[] {
  return selectPdfGeneric(ACQUISITION_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: AcquisitionPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
