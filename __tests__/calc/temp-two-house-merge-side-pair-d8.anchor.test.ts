/**
 * D8 — 혼인·동거봉양 합가 세대의 §155① 짝은 **합가 전 같은 쪽 안에서** 또는 **합가 후 취득분**으로 고른다.
 *
 * 종전 도출(「양도 주택보다 나중 취득한 행이 정확히 1채」)은 소유 쪽을 보지 않아, 상대 쪽이 합가 전에 취득한 주택을
 * 양도자 세대의 신규 주택으로 보거나(2주택 합가에서 ①을 세움) 상대 쪽·합가 후 주택이 함께 나중 취득이면 짝을 못 찾았다
 * (사전-2026-법규재산-0643 사안 — 상대 쪽이 일시적 2주택이면 C 취득일부터 3년 안에 A 또는 B 양도 시 비과세).
 * route 결론은 해석례 평가셋 `E211-era`(과세)·`P-E211-within`·`P-E211-sell-b`(비과세)가 고정한다.
 *
 * | # | 구성(양도 주택 S 외) | 합가 맥락 있음 | 맥락 없음(종전) |
 * |---|---|---|---|
 * | P-1 | 상대 쪽 B(2018)·C(2022) · S 2018-02 (0643) | B→C | 없음(나중 취득 2채) |
 * | P-2 | 상대 쪽 B(S 뒤 · 합가 전) + 합가 후 C | S→C | 없음(나중 취득 2채) |
 * | P-3 | 양도자 쪽 B(S 뒤) + 상대 쪽 A(S 뒤) | S→B | 없음(나중 취득 2채) |
 * | P-4 | 상대 쪽 1채(S 뒤) — 2주택 합가 | 없음(①이 아니라 ⑤) | S→그 주택 |
 * | P-5 | 양도자 쪽 B가 S보다 먼저 — S가 신규 | 없음 | 없음 |
 * | P-6 | 쪽 미선택 행 | 없음 | — |
 * | P-7 | 합가 후 2채 | 없음 | — |
 * | P-8 | S를 합가 후 취득 | 종전 규칙(나중 취득 1채) | 같음 |
 * | P-9 | 맥락 분기가 없음이어도 직접 선언 폴백은 그대로 | 선언값 | 선언값 |
 * | W-1 | 계산기 ④ `buildHouseholdSpecialPayload` — 폼의 혼인일로 같은 짝이 실린다 |
 * | W-2 | 판정 메뉴 ⑤ 카드 — 종전주택 취득일이 도출된 짝(B)이다 |
 */
import { describe, it, expect } from "vitest";
import { resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { MergeContext } from "@/lib/calc/merge-house-origin";

const MARRIAGE: MergeContext = { kind: "marriage", mergeDate: "2022-11-23" };
type Row = { id: string; acquisitionDate: string; mergeOrigin?: HouseEntry["mergeOrigin"] };
const pair = (sellingAcq: string, houses: Row[], mergeContext: MergeContext | undefined, over = {}) => {
  const r = resolveTemporaryTwoHouse({
    primaryKind: "housing",
    primaryAcquisitionDate: sellingAcq,
    houses,
    transferDate: "2025-03-19",
    mergeContext,
    legacyPrecedence: false,
    declaredSpecial: false,
    declaredNewHouseDate: "",
    excludedHouseIds: new Set<string>(),
    ...over,
  });
  return r ? `${r.previousAcquisitionDate}→${r.newAcquisitionDate}` : undefined;
};
const C0643: Row[] = [
  { id: "b", acquisitionDate: "2018-11-23", mergeOrigin: "counterpart_side" },
  { id: "c", acquisitionDate: "2022-04-19", mergeOrigin: "counterpart_side" },
];

describe("짝 도출 — 합가 맥락", () => {
  it("P-1 상대 쪽 두 채(0643) — 상대 쪽 B→C · 맥락 없으면 못 찾는다", () => {
    expect(pair("2018-02-22", C0643, MARRIAGE)).toBe("2018-11-23→2022-04-19");
    expect(pair("2018-02-22", C0643, undefined)).toBeUndefined();
  });
  it("P-2 상대 쪽 1채(S 뒤) + 합가 후 1채 — S→합가 후 주택", () => {
    const rows: Row[] = [
      { id: "b", acquisitionDate: "2019-05-01", mergeOrigin: "counterpart_side" },
      { id: "c", acquisitionDate: "2024-03-01" },
    ];
    expect(pair("2015-01-01", rows, MARRIAGE)).toBe("2015-01-01→2024-03-01");
    expect(pair("2015-01-01", rows, undefined)).toBeUndefined();
  });
  it("P-3 양도자 쪽 1채 + 상대 쪽 1채(둘 다 S 뒤) — S→양도자 쪽 주택", () => {
    const rows: Row[] = [
      { id: "a", acquisitionDate: "2018-01-01", mergeOrigin: "counterpart_side" },
      { id: "b", acquisitionDate: "2020-06-01", mergeOrigin: "seller_side" },
    ];
    expect(pair("2015-01-01", rows, MARRIAGE)).toBe("2015-01-01→2020-06-01");
    expect(pair("2015-01-01", rows, undefined)).toBeUndefined();
  });
  it("P-4 2주택 합가 — 상대 쪽 주택은 양도자 세대의 신규 주택이 아니다(종전에는 ①을 세웠다)", () => {
    const rows: Row[] = [{ id: "b", acquisitionDate: "2018-01-01", mergeOrigin: "counterpart_side" }];
    expect(pair("2015-01-01", rows, MARRIAGE)).toBeUndefined();
    expect(pair("2015-01-01", rows, undefined)).toBe("2015-01-01→2018-01-01");
  });
  it("P-5 양도자 쪽 다른 주택이 S보다 먼저 — S가 신규 주택이라 짝 없음", () => {
    const rows: Row[] = [
      { id: "b", acquisitionDate: "2014-01-01", mergeOrigin: "seller_side" },
      { id: "a", acquisitionDate: "2016-01-01", mergeOrigin: "counterpart_side" },
    ];
    expect(pair("2015-01-01", rows, MARRIAGE)).toBeUndefined();
  });
  it("P-6 쪽을 고르지 않은 행이 있으면 짝도 모른다", () => {
    expect(pair("2018-02-22", [C0643[0], { id: "c", acquisitionDate: "2022-04-19" }], MARRIAGE)).toBeUndefined();
  });
  it("P-7 합가 후 취득 2채 — 억측으로 고르지 않는다", () => {
    const rows: Row[] = [
      { id: "c", acquisitionDate: "2023-01-01" },
      { id: "d", acquisitionDate: "2024-01-01" },
    ];
    expect(pair("2015-01-01", rows, MARRIAGE)).toBeUndefined();
  });
  it("P-8 양도 주택을 합가 후 취득 — 종전 규칙(나중 취득 1채)", () => {
    const rows: Row[] = [
      { id: "b", acquisitionDate: "2018-01-01", mergeOrigin: "counterpart_side" },
      { id: "c", acquisitionDate: "2024-06-01" },
    ];
    expect(pair("2023-02-01", rows, MARRIAGE)).toBe("2023-02-01→2024-06-01");
  });
  it("P-9 맥락 분기가 짝을 못 찾아도 직접 선언 폴백은 그대로", () => {
    const rows: Row[] = [{ id: "b", acquisitionDate: "2018-01-01", mergeOrigin: "counterpart_side" }];
    expect(pair("2015-01-01", rows, MARRIAGE, { declaredSpecial: true, declaredNewHouseDate: "2024-01-01" })).toBe(
      "2015-01-01→2024-01-01",
    );
  });
});

const house = (r: Row): HouseEntry =>
  ({
    region: "non_capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...r,
  }) as HouseEntry;

describe("배선", () => {
  it("W-1 계산기 ④ — 폼 혼인일로 상대 쪽 짝이 실린다", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2025-03-19";
    f.marriageDate = "2022-11-23";
    f.houses = C0643.map(house);
    const primary = { ...f.assets[0], assetKind: "housing" as const, acquisitionDate: "2018-02-22" };
    const body = buildHouseholdSpecialPayload(f, primary) as { temporaryTwoHouse?: Record<string, unknown> };
    expect(body.temporaryTwoHouse).toMatchObject({
      previousAcquisitionDate: "2018-11-23",
      newAcquisitionDate: "2022-04-19",
    });
  });
  it("W-2 판정 메뉴 ⑤ 카드 — 1년 요건을 상대 쪽 짝(B→C)으로 본다", () => {
    const f = createInitialOneHouseJudgmentForm();
    Object.assign(f, { transferDate: "2025-03-19", marriageDate: "2022-11-23", isOneHousehold: true });
    f.assets = [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-02-22" }];
    f.houses = C0643.map(house);
    const v = judgmentTempTwoHouseVerdict(f);
    expect(v.status).not.toBe("pending");
    // B(2018-11-23) 취득 1년 뒤 = 2019-11-24부터 — 양도 주택(2018-02-22) 기준이면 2019-02-23
    expect(JSON.stringify(v)).toContain("2019-11-24");
  });
});
