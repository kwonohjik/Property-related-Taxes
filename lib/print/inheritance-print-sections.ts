/**
 * 계산 결과 선택 출력 — 상속세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print.design.md §2·§3
 * 단일 진실: 결과뷰(InheritanceTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어한다. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 */

export type PrintChannel = "screen" | "pdf";

/** 선택 가능 leaf 16종 (오타 방지·exact 매칭) */
export type PrintSectionId =
  | "core-result"
  | "tax-summary"
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
  | "unlisted-stock-besshi"
  | "listed-stock-besshi"
  | "installment-guide"
  | "warnings";

export interface PrintSectionNode {
  id: PrintSectionId;
  label: string;
  /** ["screen"] 기본, 별지(서버 PDF 대상)는 ["screen","pdf"] */
  channel: PrintChannel[];
}

export type PrintSectionGroupId =
  | "group:summary"
  | "group:source"
  | "group:forms"
  | "group:valuation"
  | "group:etc";

export interface PrintSectionGroup {
  id: PrintSectionGroupId;
  label: string;
  children: PrintSectionNode[];
}

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];

/** §2 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const INHERITANCE_PRINT_SECTIONS: PrintSectionGroup[] = [
  {
    id: "group:summary",
    label: "계산 요약",
    children: [
      { id: "core-result", label: "핵심 결과 (결정세액)", channel: SCREEN },
      // 서버 PDF(PR-2): 현존 ResultPdfDocument 상속세 섹션으로 표현 가능 → pdf 채널
      { id: "tax-summary", label: "상속세 과세 요약", channel: SCREEN_PDF },
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
      // PR-3a: 별지9호 react-pdf(FilingForm9PdfPage) ResultPdfDocument 통합 완료 → pdf 승격
      { id: "filing-form-9", label: "별지 제9호서식 (앞쪽)", channel: SCREEN_PDF },
      // 나머지 별지 react-pdf는 PR-3b~ 미구현 → screen-only (거짓 선택 방지)
      { id: "besshi-buppyo-2", label: "별지 제9호서식 부표2 (상속인별)", channel: SCREEN },
      {
        id: "deduction-besshi",
        label: "부표3·별지5호·별지1호 (채무·공과·장례·영농·가업)",
        channel: SCREEN,
      },
    ],
  },
  {
    id: "group:valuation",
    label: "재산 평가",
    children: [
      { id: "valuation-detail", label: "재산 평가 내역", channel: SCREEN },
      // 별지 react-pdf는 PR-3 미구현 → screen-only (PR-3에서 pdf 승격)
      { id: "unlisted-stock-besshi", label: "비상장주식 별지4 부표3", channel: SCREEN },
      { id: "listed-stock-besshi", label: "상장주식 평가조서 (갑·을)", channel: SCREEN },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "installment-guide", label: "연부연납 안내", channel: SCREEN },
      { id: "warnings", label: "주의 사항", channel: SCREEN },
    ],
  },
];

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: PrintSectionGroup[] = INHERITANCE_PRINT_SECTIONS
): PrintSectionId[] {
  return groups.flatMap((g) => g.children.map((c) => c.id));
}

/** channel에 "pdf" 포함 leaf만 (별지 7종) */
export function pdfEligibleIds(
  groups: PrintSectionGroup[] = INHERITANCE_PRINT_SECTIONS
): PrintSectionId[] {
  return groups.flatMap((g) =>
    g.children.filter((c) => c.channel.includes("pdf")).map((c) => c.id)
  );
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: PrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return selectedIds.has(id) ? "" : "print:hidden";
}

/**
 * 서버 PDF에 포함할 섹션 (PR-2) — 선택 ∩ pdf 채널 ∩ (가용).
 * PrintSelectionPanel·route 공용 단일 헬퍼 (이중 정의 금지).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): PrintSectionId[] {
  return pdfEligibleIds().filter(
    (id) => selectedIds.has(id) && (!availableIds || availableIds.has(id))
  );
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export type GroupCheckState = "all" | "partial" | "none";

export function resolveGroupCheckState(
  group: PrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  const total = group.children.length;
  const selected = group.children.filter((c) => selectedIds.has(c.id)).length;
  if (selected === 0) return "none";
  if (selected === total) return "all";
  return "partial";
}
