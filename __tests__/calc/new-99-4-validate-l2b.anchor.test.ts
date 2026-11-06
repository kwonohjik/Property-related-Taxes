/**
 * ⑧↔⑫ 격자 — §99의4 수도권 행 모순(NH-20 · Q-7 (b))·연접 3상태(NH-30)·면적 필수(NH-05 PR-2b)
 *
 * ⑧ `collectHouseCountExclusionReductionErrors`(계산기·판정 메뉴 공용 leaf)와 ⑫ `refineNew994CapitalRegion`이
 * 같은 칸에서 같이 막고 같이 연다. 수도권 예외 군은 양도일별(조특령 §99의4③ 구 문언 연천·옹진 → 2023.2.28. 이후
 * 강화 추가 → 2025.3.21. 이후 가평 추가), 고향주택은 예외 없음, 2023.7.10. 이후 취득분은 기회발전특구 판정 불가라 막지 않는다.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { collectHouseCountExclusionReductionErrors } from "@/lib/calc/house-count-exclusion-reduction-validate";
import { refineNew994CapitalRegion } from "@/lib/api/transfer-tax-schema-reduction-refines";
import { toNew994Payload } from "@/lib/calc/new-99-4-form";
import type { RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

const decl = (over: Record<string, unknown> = {}) =>
  ({
    type: "new_99_4_rural",
    ruralHouseAcquisitionDate: "2018-05-01",
    ruralHouseStdPrice: "150000000",
    isRegisteredHanok: false,
    adjacentArea994: "no",
    meetsLocationRequirement: true,
    ...over,
  }) as RowCountExclusionReduction;

const step8Blocks = (r: RowCountExclusionReduction, transferDate: string) =>
  collectHouseCountExclusionReductionErrors(r, transferDate).some((m) => m.includes("수도권으로 조회됩니다"));

function step12Blocks(r: RowCountExclusionReduction, transferDate: string): boolean {
  const schema = z.object({ reductions: z.array(z.record(z.string(), z.unknown())), transferDate: z.string() }).superRefine((d, ctx) =>
    refineNew994CapitalRegion(d.reductions as never, d.transferDate, ctx, ["reductions"]),
  );
  return !schema.safeParse({ reductions: [toNew994Payload(r as Parameters<typeof toNew994Payload>[0])], transferDate }).success;
}

const CELLS: { id: string; r: RowCountExclusionReduction; transfer: string; blocks: boolean }[] = [
  { id: "양평(예외 아님) 2025 양도", r: decl({ ruralHouseRegionCode: "4183025000" }), transfer: "2025-06-02", blocks: true },
  { id: "음성(수도권 밖)", r: decl({ ruralHouseRegionCode: "4377037000" }), transfer: "2025-06-02", blocks: false },
  { id: "연천 2012 양도", r: decl({ ruralHouseRegionCode: "4180025000", ruralHouseAcquisitionDate: "2008-05-01", ruralLandAreaSqm994: "330" }), transfer: "2012-06-01", blocks: false },
  { id: "옹진 2012 양도", r: decl({ ruralHouseRegionCode: "2872031000", ruralHouseAcquisitionDate: "2008-05-01", ruralLandAreaSqm994: "330" }), transfer: "2012-06-01", blocks: false },
  { id: "강화 2022 양도(령 개정 전)", r: decl({ ruralHouseRegionCode: "2871025000" }), transfer: "2022-06-01", blocks: true },
  { id: "강화 2023-03-20 양도", r: decl({ ruralHouseRegionCode: "2871025000" }), transfer: "2023-03-20", blocks: false },
  { id: "가평 2025-03-20 양도", r: decl({ ruralHouseRegionCode: "4182025000" }), transfer: "2025-03-20", blocks: true },
  { id: "가평 2025-03-21 양도", r: decl({ ruralHouseRegionCode: "4182025000" }), transfer: "2025-03-21", blocks: false },
  { id: "서울 2023-07-09 취득(특구 근거법 시행 전)", r: decl({ ruralHouseRegionCode: "1168010100", ruralHouseAcquisitionDate: "2023-07-09" }), transfer: "2025-06-02", blocks: true },
  { id: "서울 2023-07-10 취득(특구 판정 불가 — 막지 않음)", r: decl({ ruralHouseRegionCode: "1168010100", ruralHouseAcquisitionDate: "2023-07-10" }), transfer: "2025-06-02", blocks: false },
  { id: "고향주택 연천(수도권 예외 없음)", r: decl({ type: "new_99_4_hometown", meetsHometownRequirement: true, ruralHouseRegionCode: "4180025000" }), transfer: "2025-06-02", blocks: true },
  { id: "양평이지만 소재지 OFF", r: decl({ ruralHouseRegionCode: "4183025000", meetsLocationRequirement: false }), transfer: "2025-06-02", blocks: false },
  { id: "법정동코드 없음(수동 주소)", r: decl({}), transfer: "2025-06-02", blocks: false },
];

describe("NH-20 ⑧↔⑫ 격자", () => {
  it.each(CELLS)("$id → 막음 $blocks", ({ r, transfer, blocks }) => {
    expect(step8Blocks(r, transfer)).toBe(blocks);
    expect(step12Blocks(r, transfer)).toBe(blocks);
  });
});

describe("NH-30 · PR-2b ⑧ 필수값", () => {
  const msgs = (r: RowCountExclusionReduction, t: string) => collectHouseCountExclusionReductionErrors(r, t).join(" | ");
  it("연접 미응답·옛 false는 묻고, 예·아니오·모름은 통과", () => {
    expect(msgs(decl({ adjacentArea994: "" }), "2025-06-02")).toContain("예·아니오·모름");
    expect(msgs(decl({ adjacentArea994: undefined, isAdjacentArea: false }), "2025-06-02")).toContain("예·아니오·모름");
    for (const a of ["yes", "no", "unknown"]) expect(msgs(decl({ adjacentArea994: a }), "2025-06-02")).toBe("");
    // 옛 저장값 true는 사용자가 켠 답 — 「예」로 읽는다
    expect(msgs(decl({ adjacentArea994: undefined, isAdjacentArea: true }), "2025-06-02")).toBe("");
  });
  it("대지면적: 2020-12-31 양도는 묻고 2021-01-01 양도는 묻지 않는다", () => {
    expect(msgs(decl({}), "2020-12-31")).toContain("대지면적");
    expect(msgs(decl({}), "2021-01-01")).toBe("");
  });
  it("주택 면적: 2016 양도 × 2014 취득은 유형·면적을 묻고, 공동주택은 행 전용면적을 본다", () => {
    const c1 = { ruralHouseAcquisitionDate: "2014-03-01", ruralLandAreaSqm994: "330" };
    expect(msgs(decl(c1), "2016-06-01")).toContain("주택 유형");
    expect(msgs(decl({ ...c1, ruralHouseType994: "other" }), "2016-06-01")).toContain("주택 연면적");
    expect(msgs(decl({ ...c1, ruralHouseType994: "other", ruralHouseFloorAreaSqm994: "99" }), "2016-06-01")).toBe("");
    expect(msgs(decl({ ...c1, ruralHouseType994: "multi_unit" }), "2016-06-01")).toContain("전용면적");
    expect(msgs(decl({ ...c1, ruralHouseType994: "multi_unit", ruralHouseExclusiveAreaSqm994: "84" }), "2016-06-01")).toBe("");
    // 2009.1.1. 전 취득분(R1·R2)은 주택 면적을 묻지 않는다(계획서 Q-4 (c))
    expect(msgs(decl({ ruralHouseAcquisitionDate: "2005-06-01", ruralLandAreaSqm994: "330", ruralHouseStdPrice: "60000000" }), "2012-06-01")).toBe("");
  });
});
