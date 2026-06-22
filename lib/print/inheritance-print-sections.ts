/**
 * 계산 결과 선택 출력 — 상속세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print.design.md §2·§3
 * 단일 진실: 결과뷰(InheritanceTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어한다. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
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

/** 선택 가능 leaf 15종 (오타 방지·exact 매칭) — core-result(핵심 결과 카드) 제거 2026-06-13 */
export type PrintSectionId =
  | "tax-summary"
  | "exemption-detail"
  | "cultural-heritage-deferral"
  | "heir-allocation-summary"
  | "deduction-breakdown"
  | "allocation-breakdown"
  | "source-data"
  | "prior-gift-filing"
  | "corporate-exemption"
  | "debt-allocation"
  | "filing-form-9"
  | "besshi-buppyo-2"
  | "deduction-besshi"
  | "valuation-detail"
  | "building-std-report"
  | "unlisted-stock-besshi"
  | "unlisted-stock-simple"
  | "listed-stock-besshi"
  | "installment-guide"
  | "split-payment"
  | "payment-in-kind"
  | "warnings";

/** 상속세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type PrintSectionNode = GenericNode<PrintSectionId>;
export type PrintSectionGroup = GenericGroup<PrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const INHERITANCE_PRINT_SECTIONS: PrintSectionGroup[] = [
  {
    id: "group:summary",
    label: "계산 요약",
    children: [
      // core-result(핵심 결과 카드) 제거 2026-06-13 — 과세 요약과 중복, 화면 효용 낮음
      // 서버 PDF(PR-2): 현존 ResultPdfDocument 상속세 섹션으로 표현 가능 → pdf 채널
      { id: "tax-summary", label: "상속세 과세 요약", channel: SCREEN_PDF },
      { id: "exemption-detail", label: "비과세 적용 내역 (금양임야·묘토·족보)", channel: SCREEN },
      { id: "cultural-heritage-deferral", label: "문화유산 등 징수유예 (§74)", channel: SCREEN },
      { id: "heir-allocation-summary", label: "상속인별 상속세부담액 집계", channel: SCREEN_PDF },
      { id: "deduction-breakdown", label: "상속공제 상세 내역", channel: SCREEN },
      { id: "allocation-breakdown", label: "산출세액·증여세액공제 근거", channel: SCREEN },
    ],
  },
  {
    id: "group:source",
    label: "상속개시 자료",
    children: [
      { id: "source-data", label: "상속개시자료 요약", channel: SCREEN },
      { id: "prior-gift-filing", label: "사전증여재산 명세", channel: SCREEN },
      { id: "corporate-exemption", label: "영리법인 상속세 면제", channel: SCREEN },
      { id: "debt-allocation", label: "채무·공과·장례비 협의분할", channel: SCREEN },
    ],
  },
  {
    id: "group:forms",
    label: "공식 신고서식",
    children: [
      // PR-3a/3b: 별지 react-pdf를 ResultPdfDocument에 통합 완료 → pdf 승격
      { id: "filing-form-9", label: "별지 제9호서식 (앞쪽)", channel: SCREEN_PDF },
      { id: "besshi-buppyo-2", label: "별지 제9호서식 부표2 (상속인별)", channel: SCREEN_PDF },
      {
        id: "deduction-besshi",
        label: "부표3·별지5호·별지1호 (채무·공과·장례·영농·가업)",
        channel: SCREEN_PDF,
      },
    ],
  },
  {
    id: "group:valuation",
    label: "재산 평가",
    children: [
      { id: "valuation-detail", label: "재산 평가 내역", channel: SCREEN },
      { id: "building-std-report", label: "건물 기준시가 계산서", channel: SCREEN_PDF },
      // PR-3b: ResultPdfDocument 통합 완료 → pdf 승격
      { id: "unlisted-stock-besshi", label: "비상장주식 별지4 부표3 (정식평가)", channel: SCREEN_PDF },
      { id: "unlisted-stock-simple", label: "비상장주식 평가조서 (간편평가)", channel: SCREEN },
      { id: "listed-stock-besshi", label: "상장주식 평가조서 (갑·을)", channel: SCREEN_PDF },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "installment-guide", label: "연부연납 안내", channel: SCREEN },
      { id: "split-payment", label: "분납 안내 (§70②)", channel: SCREEN },
      { id: "payment-in-kind", label: "물납 안내 (§73)", channel: SCREEN },
      { id: "warnings", label: "주의 사항", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 INHERITANCE_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (기존 시그니처·동작 100% 보존 → 상속세 호출부·anchor 무변경. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: PrintSectionGroup[] = INHERITANCE_PRINT_SECTIONS
): PrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (별지 7종) */
export function pdfEligibleIds(
  groups: PrintSectionGroup[] = INHERITANCE_PRINT_SECTIONS
): PrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: PrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-2) — 선택 ∩ pdf 채널 ∩ (가용).
 * 상속세 전용 래퍼 (groups=INHERITANCE 바인딩, 기존 2인자 시그니처 보존).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): PrintSectionId[] {
  return selectPdfGeneric(INHERITANCE_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: PrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
