/**
 * 계산 결과 선택 출력 — 국외자산 부동산 양도소득세 출력 항목 레지스트리 (순수 데이터)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §1 · 국외 부동산 U2(`transfer-foreign-realestate.ui.plan.md` §14).
 * 선택은 «인쇄 대상»만 제어한다 — 미선택이어도 화면에는 그대로 보이고 인쇄(print)에서만 `print:hidden`.
 *
 * pdf 채널 = 없음. 서버·클라이언트 PDF(`ResultPdfDocument`)에 국외 부동산 섹션이 없다 — 거짓 선택 방지 원칙에 따라 어떤 leaf에도 pdf를 주지 않는다.
 * 사용자는 「선택 항목 인쇄」(window.print → 브라우저 PDF 저장)로 출력한다.
 *
 * ⚠️ leaf를 늘리면 `__tests__/print/transfer-foreign-print-sections.test.ts`의 `ALL_LEAVES`도 늘린다 — union에서 파생되지 않아 타입이 강제하지 않는다.
 */
import {
  type PrintChannel,
  type PrintSectionNode as GenericNode,
  type PrintSectionGroup as GenericGroup,
  flattenPrintSectionIds as flattenGeneric,
} from "@/lib/print/print-sections.types";

export type TransferForeignPrintSectionId =
  /** 총 납부세액 요약 카드 */
  | "summary"
  /** 자산별 환산 · 양도차익 · 양도소득금액 */
  | "asset-gain"
  /** 과세표준 · 산출세액 · 외국납부세액 · 지방소득세 · 총 납부세액 */
  | "tax-calc"
  /** 확인 필요 · 주의 · 적용 법령 */
  | "notices";

export type TransferForeignPrintSectionGroup = GenericGroup<TransferForeignPrintSectionId>;
export type TransferForeignPrintSectionNode = GenericNode<TransferForeignPrintSectionId>;

const SCREEN: PrintChannel[] = ["screen"];

export const TRANSFER_FOREIGN_PRINT_SECTIONS: TransferForeignPrintSectionGroup[] = [
  {
    id: "group:calc",
    label: "계산 내역",
    children: [
      { id: "summary", label: "총 납부세액 요약", channel: SCREEN },
      { id: "asset-gain", label: "자산별 원화 환산·양도차익", channel: SCREEN },
      { id: "tax-calc", label: "과세표준·세액·외국납부세액·지방소득세", channel: SCREEN },
      { id: "notices", label: "확인 필요·주의사항·적용 법령", channel: SCREEN },
    ],
  },
];

/** 모든 leaf id (선언 순서) */
export function flattenTransferForeignPrintIds(
  groups: TransferForeignPrintSectionGroup[] = TRANSFER_FOREIGN_PRINT_SECTIONS,
): TransferForeignPrintSectionId[] {
  return flattenGeneric(groups);
}
