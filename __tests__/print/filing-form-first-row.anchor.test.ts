/**
 * anchor: 「출력 항목 선택」 목록의 **첫 행은 신고서 서식**이다
 *
 * 제보 —「모든 출력항목 선택에서 "신고서 양식" 항목이 첫번째 행에 위치하도록 수정해」
 *
 * ## 왜 레지스트리 레벨인가
 *
 * 패널(`PrintSelectionPanel`)은 `allGroups`를 **선언 순서 그대로** 펼쳐 렌더한다. 즉 목록의
 * 첫 행을 정하는 것은 각 세목 레지스트리의 그룹·leaf 선언 순서이고, 그 순서를 여기서 고정하면
 * 8개 세목을 화면 8개로 도는 E2E 없이도 회귀를 잡는다.
 *
 * ⚠️ **취득세·재산세에는 신고서 서식 leaf 자체가 없다** — 「없다」는 사실도 함께 고정한다.
 *   나중에 서식이 생기면 이 단언이 깨져서 첫 행 규칙을 적용할 자리를 알려준다(그냥 빼 두면
 *   새 서식이 목록 한가운데에 조용히 들어간다).
 *
 * 🔑 순서 변경이 **서버 PDF 출력 순서를 바꾸지 않는다**는 것도 확인했다 — `ResultPdfDocument`는
 *   `selectedSectionIds.includes(...)`로 **포함 여부만** 보고, 섹션 배치는 자기 JSX 순서로
 *   고정한다. 레지스트리 순서는 패널 목록에만 영향을 준다.
 */

import { describe, it, expect } from "vitest";
import { TRANSFER_PRINT_SECTIONS } from "@/lib/print/transfer-print-sections";
import { MULTI_TRANSFER_PRINT_SECTIONS } from "@/lib/print/multi-transfer-print-sections";
import { MIXED_USE_PRINT_SECTIONS } from "@/lib/print/mixed-use-print-sections";
import { STOCK_TRANSFER_PRINT_SECTIONS } from "@/lib/print/stock-transfer-print-sections";
import { GIFT_PRINT_SECTIONS } from "@/lib/print/gift-print-sections";
import { INHERITANCE_PRINT_SECTIONS } from "@/lib/print/inheritance-print-sections";
import { COMPREHENSIVE_PRINT_SECTIONS } from "@/lib/print/comprehensive-print-sections";
import { ACQUISITION_PRINT_SECTIONS } from "@/lib/print/acquisition-print-sections";
import { PROPERTY_PRINT_SECTIONS } from "@/lib/print/property-print-sections";

/** 패널이 렌더하는 순서 그대로의 leaf id 목록 */
function leafOrder(groups: ReadonlyArray<{ children: ReadonlyArray<{ id: string }> }>): string[] {
  return groups.flatMap((g) => g.children.map((c) => c.id));
}

/** 신고서 서식 leaf를 가진 세목 — 첫 행이어야 하는 id */
const FILING_FIRST: Array<[string, ReadonlyArray<{ children: ReadonlyArray<{ id: string }> }>, string]> = [
  ["양도소득세", TRANSFER_PRINT_SECTIONS, "form-table"],
  ["다건 양도", MULTI_TRANSFER_PRINT_SECTIONS, "form-table"],
  ["겸용주택", MIXED_USE_PRINT_SECTIONS, "form-table"],
  ["주식 양도세", STOCK_TRANSFER_PRINT_SECTIONS, "filing-form"],
  ["증여세", GIFT_PRINT_SECTIONS, "filing-form-10"],
  ["상속세", INHERITANCE_PRINT_SECTIONS, "filing-form-9"],
  ["종합부동산세", COMPREHENSIVE_PRINT_SECTIONS, "filing-form-main"],
];

/** 신고서 서식 leaf가 **없는** 세목 — 그 사실 자체를 고정한다 */
const NO_FILING: Array<[string, ReadonlyArray<{ children: ReadonlyArray<{ id: string }> }>]> = [
  ["취득세", ACQUISITION_PRINT_SECTIONS],
  ["재산세", PROPERTY_PRINT_SECTIONS],
];

describe("출력 항목 선택 — 신고서 서식이 첫 행", () => {
  it.each(FILING_FIRST)("FR-1 %s: 첫 leaf가 %s 이다", (_label, groups, expectedFirst) => {
    const order = leafOrder(groups);
    expect(order[0], `실제 순서: ${order.slice(0, 3).join(" → ")}`).toBe(expectedFirst);
  });

  it.each(NO_FILING)("FR-2 %s: 신고서 서식 leaf가 없다 (첫 행 규칙 비적용)", (_label, groups) => {
    const ids = leafOrder(groups);
    const filingLike = ids.filter((id) => /^filing-form|^form-table|besshi|buppyo/.test(id));
    expect(filingLike, `서식처럼 보이는 leaf: ${filingLike.join(", ")}`).toHaveLength(0);
  });
});
