/**
 * 계산 결과 선택 출력 — 증여세 출력 항목 레지스트리 (순수 데이터·헬퍼)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.1
 * 단일 진실: 결과뷰(GiftTaxResultView)의 선택 가능 섹션 ↔ data-print-id ↔ 선택 UI.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어한다. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 *
 * pdf 채널 (PR-B2 완료) = tax-summary(계산표) + 별지4(filing-form-10·valuation-form·주식2) = 5종.
 *   PR-B1=tax-summary, PR-B2=별지4 (GiftFilingForm10/GiftValuationForm PDF + gift-besshi-pages 위임).
 *   (PR-2 거짓 선택 방지: 실제 분리 렌더 가능한 노드만 pdf 채널)
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

/** 선택 가능 leaf 13종 (오타 방지·exact 매칭) */
export type GiftPrintSectionId =
  | "core-result"
  | "tax-summary"
  | "gen-skip-surcharge"
  | "tax-credit"
  | "donor-paid-grossup"
  | "prior-gift"
  | "filing-form-10"
  | "valuation-form"
  | "unlisted-stock-besshi"
  | "unlisted-stock-simple"
  | "listed-stock-besshi"
  | "installment"
  | "split-payment"
  | "warnings"
  | "burdened-transfer-tax"
  | "burdened-gift-comparison";

/** 증여세 leaf로 좁힌 제네릭 타입 (shared 재사용) */
export type GiftPrintSectionNode = GenericNode<GiftPrintSectionId>;
export type GiftPrintSectionGroup = GenericGroup<GiftPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];
const SCREEN_PDF: PrintChannel[] = ["screen", "pdf"];
const PDF: PrintChannel[] = ["pdf"];

/** §2.1 계층 트리 — 큰 섹션(그룹) → 개별 서식(leaf) */
export const GIFT_PRINT_SECTIONS: GiftPrintSectionGroup[] = [
  {
    id: "group:summary",
    label: "계산 요약",
    children: [
      { id: "core-result", label: "핵심 결과 (결정세액)", channel: SCREEN },
      // 화면 카드는 신고서 양식(filing-form-10)과 중복이라 제거 — PDF 계산표(ResultPdfDocument)로만 표현 → pdf 전용 채널
      { id: "tax-summary", label: "증여세 과세 요약", channel: PDF },
      { id: "gen-skip-surcharge", label: "세대생략 할증 근거 (§57)", channel: SCREEN },
      { id: "tax-credit", label: "세액공제 상세 (§28·§69)", channel: SCREEN },
      { id: "donor-paid-grossup", label: "대납(代納) gross-up 상세 (§36)", channel: SCREEN },
    ],
  },
  {
    id: "group:source",
    label: "증여 자료",
    children: [
      { id: "prior-gift", label: "사전증여 합산 내역 (§47)", channel: SCREEN },
    ],
  },
  {
    id: "group:forms",
    label: "공식 신고서식",
    children: [
      // PR-B2: GiftFilingForm10PdfDocument react-pdf 포팅 완료 → pdf 승격
      { id: "filing-form-10", label: "별지 제10호서식", channel: SCREEN_PDF },
      // PR-B2: GiftValuationFormPdfDocument 신규 완료 → pdf 승격
      { id: "valuation-form", label: "증여재산 및 평가명세서 (부표1)", channel: SCREEN_PDF },
    ],
  },
  {
    id: "group:valuation",
    label: "재산 평가",
    children: [
      // PR-B2: gift-besshi-pages 위임 완료 → pdf 승격 (주식 별지 react-pdf는 PR-3b 재사용)
      { id: "unlisted-stock-besshi", label: "비상장주식 별지4 부표3 (정식평가)", channel: SCREEN_PDF },
      { id: "unlisted-stock-simple", label: "비상장주식 평가조서 (간편평가)", channel: SCREEN },
      { id: "listed-stock-besshi", label: "상장주식 평가조서 (갑·을)", channel: SCREEN_PDF },
    ],
  },
  {
    id: "group:etc",
    label: "기타",
    children: [
      { id: "installment", label: "연부연납 안내", channel: SCREEN },
      { id: "split-payment", label: "분납 안내 (§70②)", channel: SCREEN },
      { id: "warnings", label: "주의 사항", channel: SCREEN },
      { id: "burdened-transfer-tax", label: "부담부증여 양도소득세 (증여자)", channel: SCREEN },
      { id: "burdened-gift-comparison", label: "세부담 비교 (단순증여 vs 부담부증여)", channel: SCREEN },
    ],
  },
];

// ── 헬퍼: shared 제네릭을 GIFT_PRINT_SECTIONS에 바인딩한 래퍼 ──
// (inheritance-print-sections.ts와 동일 패턴 — 기존 시그니처·동작 보존. PR-A 제네릭화)

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds(
  groups: GiftPrintSectionGroup[] = GIFT_PRINT_SECTIONS
): GiftPrintSectionId[] {
  return flattenGeneric(groups);
}

/** channel에 "pdf" 포함 leaf만 (PR-B1: tax-summary 1종) */
export function pdfEligibleIds(
  groups: GiftPrintSectionGroup[] = GIFT_PRINT_SECTIONS
): GiftPrintSectionId[] {
  return pdfEligibleGeneric(groups);
}

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: GiftPrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return resolveVisibilityGeneric(id, selectedIds);
}

/**
 * 서버 PDF에 포함할 섹션 (PR-B1) — 선택 ∩ pdf 채널 ∩ (가용).
 * 증여세 전용 래퍼 (groups=GIFT 바인딩, 2인자 시그니처).
 */
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): GiftPrintSectionId[] {
  return selectPdfGeneric(GIFT_PRINT_SECTIONS, selectedIds, availableIds);
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState(
  group: GiftPrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  return resolveGroupGeneric(group, selectedIds);
}
