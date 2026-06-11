/**
 * 계산 결과 선택 출력 — 주식 양도세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.7
 * 단일 진실: 결과뷰(StockTransferTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * PR-F3: 기존 printScoped(body[data-print-scope] CSS scope, scope "full"·"form-table") → PrintSelectionPanel 통일.
 *   ⚠️ printScoped와 PrintSection(print:hidden) 공존 불가(미선택 시 scope 인쇄 무효) → printScoped 완전 제거.
 *
 * ⚠️ pdf 채널 = 없음 (0종) — F1/F2와 결정적 차이.
 *   ResultPdfDocument에 stock-transfer 전용 섹션이 없다(taxType 매칭: transfer·transfer_multi·
 *   acquisition·inheritance·gift·property·comprehensive_property — stock 부재). 서버 PDF가 stock 본문을
 *   렌더하지 못하므로 PR-2 거짓 선택 방지 원칙에 따라 어떤 leaf에도 pdf 채널 미부여.
 *   사용자는 "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)로 출력. (서버 PDF 섹션 신규는 후속)
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

/** 선택 가능 leaf 4종 (exact 매칭) */
export type StockTransferPrintSectionId =
  | "calculation"
  | "detail-cards"
  | "filing-form"
  | "securities-transaction-tax";

/** 주식 양도세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type StockTransferPrintSectionNode = GenericNode<StockTransferPrintSectionId>;
export type StockTransferPrintSectionGroup = GenericGroup<StockTransferPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];

/** §2.7 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf). 전부 SCREEN(서버 PDF 섹션 부재). */
export const STOCK_TRANSFER_PRINT_SECTIONS: StockTransferPrintSectionGroup[] = [
  {
    id: "group:calc",
    label: "계산 내역",
    children: [
      { id: "calculation", label: "핵심 결과 (분류·결과표·양도가액 산식)", channel: SCREEN },
      { id: "detail-cards", label: "상세 분해·판정 (환산·누진·평가·가산세·대주주)", channel: SCREEN },
      { id: "securities-transaction-tax", label: "증권거래세 (정보용)", channel: SCREEN },
    ],
  },
  {
    id: "group:forms",
    label: "신고서식",
    children: [
      { id: "filing-form", label: "주식 신고서 양식 표 (32행)", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 STOCK_TRANSFER_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (transfer/multi-transfer/inheritance/gift/acquisition/property/comprehensive-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: StockTransferPrintSectionGroup[] = STOCK_TRANSFER_PRINT_SECTIONS
): StockTransferPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 — stock은 0종(서버 PDF 섹션 부재) */
export function pdfEligibleIds(
  groups: StockTransferPrintSectionGroup[] = STOCK_TRANSFER_PRINT_SECTIONS
): StockTransferPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: StockTransferPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-F3) — 선택 ∩ pdf 채널 ∩ (가용).
 * 주식 양도세 전용 래퍼 (groups=STOCK_TRANSFER 바인딩, 2인자 시그니처).
 * pdf 채널 0이므로 항상 빈 배열 — 호출부(결과뷰)는 onPrintPdf 미전달 권장.
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): StockTransferPrintSectionId[] {
  return selectPdfGeneric(STOCK_TRANSFER_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: StockTransferPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
