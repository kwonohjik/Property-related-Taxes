/**
 * 계산 결과 선택 출력 — 재산세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.3
 * 단일 진실: 결과뷰(PropertyTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * pdf 채널 = computed-tax(계산표 대표) 1종.
 *   PropertySection(ResultPdfDocument)은 단일 계산표 → 분리 경계 없음(검토 U1). 별지 없음.
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

/** 선택 가능 leaf 9종 (오타 방지·exact 매칭) */
export type PropertyPrintSectionId =
  | "tax-base"
  | "computed-tax"
  | "surtax"
  | "total-payable"
  | "installment"
  | "warnings"
  | "legal-basis"
  | "taxpayer"
  | "co-ownership";

/** 재산세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type PropertyPrintSectionNode = GenericNode<PropertyPrintSectionId>;
export type PropertyPrintSectionGroup = GenericGroup<PropertyPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2.3 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const PROPERTY_PRINT_SECTIONS: PropertyPrintSectionGroup[] = [
  {
    id: "group:calc",
    label: "세액 계산",
    children: [
      { id: "tax-base", label: "과세표준", channel: SCREEN },
      // 서버 PDF: ResultPdfDocument 재산세 계산표(PropertySection)로 표현 가능 → pdf 채널
      { id: "computed-tax", label: "산출세액", channel: SCREEN_PDF },
      { id: "surtax", label: "부가세", channel: SCREEN },
      { id: "total-payable", label: "총 납부세액", channel: SCREEN },
    ],
  },
  {
    id: "group:taxpayer",
    label: "납세의무자",
    children: [
      { id: "taxpayer", label: "납세의무자 판정", channel: SCREEN },
      { id: "co-ownership", label: "공유 지분 안분", channel: SCREEN },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "installment", label: "분납 안내", channel: SCREEN },
      { id: "warnings", label: "경고", channel: SCREEN },
      { id: "legal-basis", label: "법령 근거", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 PROPERTY_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (inheritance/gift/acquisition-print-sections와 동일 패턴. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: PropertyPrintSectionGroup[] = PROPERTY_PRINT_SECTIONS
): PropertyPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (computed-tax 1종) */
export function pdfEligibleIds(
  groups: PropertyPrintSectionGroup[] = PROPERTY_PRINT_SECTIONS
): PropertyPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: PropertyPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-D) — 선택 ∩ pdf 채널 ∩ (가용).
 * 재산세 전용 래퍼 (groups=PROPERTY 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): PropertyPrintSectionId[] {
  return selectPdfGeneric(PROPERTY_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: PropertyPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
