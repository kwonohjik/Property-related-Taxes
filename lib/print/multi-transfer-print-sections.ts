/**
 * 계산 결과 선택 출력 — 양도세(다중 자산) 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.6
 * 단일 진실: 결과뷰(MultiTransferTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * PR-F2: 기존 자체 printScoped(body[data-print-scope] CSS scope) → PrintSelectionPanel 통일.
 *   ⚠️ printScoped와 PrintSection(print:hidden) 공존 불가(미선택 시 scope 인쇄 무효) → printScoped 완전 제거.
 *
 * pdf 채널 = summary(합산 결과) 1종.
 *   ResultPdfDocument TransferMultiSection이 다건 합산 계산 흐름 렌더(상세명세서·자산별 등은 화면 인쇄로만, 검토 U1).
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

/** 선택 가능 leaf 6종 (exact 매칭) */
export type MultiTransferPrintSectionId =
  | "summary"
  | "detailed-statement"
  | "reduction-recalc"
  | "group-tax"
  | "loss-offset"
  | "per-property";

/** 다중 양도세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type MultiTransferPrintSectionNode = GenericNode<MultiTransferPrintSectionId>;
export type MultiTransferPrintSectionGroup = GenericGroup<MultiTransferPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2.6 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const MULTI_TRANSFER_PRINT_SECTIONS: MultiTransferPrintSectionGroup[] = [
  {
    id: "group:summary",
    label: "합산",
    children: [
      // 서버 PDF: ResultPdfDocument 다건 합산 계산(TransferMultiSection)으로 표현 가능 → pdf 채널
      { id: "summary", label: "합산 결과", channel: SCREEN_PDF },
      { id: "detailed-statement", label: "계산결과 상세명세서", channel: SCREEN },
    ],
  },
  {
    id: "group:detail",
    label: "상세",
    children: [
      { id: "reduction-recalc", label: "감면세액 합산 재계산", channel: SCREEN },
      { id: "group-tax", label: "세율군별 분리 산출", channel: SCREEN },
      { id: "loss-offset", label: "차손 통산 표", channel: SCREEN },
      { id: "per-property", label: "건별 상세 (자산별 신고서)", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 MULTI_TRANSFER_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (transfer/inheritance/gift/acquisition/property/comprehensive-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: MultiTransferPrintSectionGroup[] = MULTI_TRANSFER_PRINT_SECTIONS
): MultiTransferPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (summary 1종) */
export function pdfEligibleIds(
  groups: MultiTransferPrintSectionGroup[] = MULTI_TRANSFER_PRINT_SECTIONS
): MultiTransferPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: MultiTransferPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-F2) — 선택 ∩ pdf 채널 ∩ (가용).
 * 다중 양도세 전용 래퍼 (groups=MULTI_TRANSFER 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): MultiTransferPrintSectionId[] {
  return selectPdfGeneric(MULTI_TRANSFER_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: MultiTransferPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
