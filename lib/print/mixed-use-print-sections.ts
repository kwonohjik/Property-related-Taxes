/**
 * 계산 결과 선택 출력 — 겸용주택 양도세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.8
 * 단일 진실: 결과뷰(MixedUseResultCard)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * PR-F4: 기존 자체 printScoped(body[data-print-scope] CSS scope, scope "full"·"form-table") → PrintSelectionPanel 통일.
 *   ⚠️ printScoped와 PrintSection(print:hidden) 공존 불가(미선택 시 scope 인쇄 무효) → printScoped 완전 제거.
 *   ⚠️ F4 = 마지막 printScoped 사용처 → globals.css `body[data-print-scope]` 규칙·Helpers 정의도 함께 제거.
 *
 * ⚠️ pdf 채널 = 없음 (0종) — F3(주식)과 동일.
 *   ResultPdfDocument에 mixed-use 전용 섹션 부재(taxType transfer는 calculation만 렌더, mixedUseDetail 미렌더).
 *   PR-2 거짓 선택 방지 원칙에 따라 어떤 leaf에도 pdf 채널 미부여.
 *   사용자는 "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)로 출력.
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

/** 선택 가능 leaf 3종 (exact 매칭) */
export type MixedUsePrintSectionId =
  | "calculation"
  | "filing-form"
  | "detailed-statement"
  | "building-std-report";

/** 겸용주택 양도세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type MixedUsePrintSectionNode = GenericNode<MixedUsePrintSectionId>;
export type MixedUsePrintSectionGroup = GenericGroup<MixedUsePrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];

/** §2.8 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf). 전부 SCREEN(서버 PDF 섹션 부재). */
export const MIXED_USE_PRINT_SECTIONS: MixedUsePrintSectionGroup[] = [
  {
    id: "group:calc",
    label: "계산 내역",
    children: [
      { id: "calculation", label: "분리계산 (안분·주택·상가·비사업용·합산세액)", channel: SCREEN },
    ],
  },
  {
    id: "group:forms",
    label: "신고서식",
    children: [
      { id: "filing-form", label: "신고서 양식 표 (32행)", channel: SCREEN },
      { id: "detailed-statement", label: "계산결과 상세명세서", channel: SCREEN },
      { id: "building-std-report", label: "건물 기준시가 계산서", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 MIXED_USE_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (transfer/multi-transfer/stock-transfer/inheritance/gift/acquisition/property/comprehensive-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: MixedUsePrintSectionGroup[] = MIXED_USE_PRINT_SECTIONS
): MixedUsePrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 — 겸용주택은 0종(서버 PDF 섹션 부재) */
export function pdfEligibleIds(
  groups: MixedUsePrintSectionGroup[] = MIXED_USE_PRINT_SECTIONS
): MixedUsePrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: MixedUsePrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-F4) — 선택 ∩ pdf 채널 ∩ (가용).
 * 겸용주택 양도세 전용 래퍼 (groups=MIXED_USE 바인딩, 2인자 시그니처).
 * pdf 채널 0이므로 항상 빈 배열 — 호출부(결과뷰)는 onPrintPdf 미전달 권장.
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): MixedUsePrintSectionId[] {
  return selectPdfGeneric(MIXED_USE_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: MixedUsePrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
