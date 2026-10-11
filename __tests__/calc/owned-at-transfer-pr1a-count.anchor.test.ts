/**
 * PR1a-① (S12-1) — 명부의 날짜 있는 행이 **전부** 양도일 당일·이후 취득이어도 명부가 정본이다.
 *
 * 근거: 소득세법 시행령 §154① 「양도일 … 현재 국내에 1주택을 보유」 + 동일자 취득 = 양도 후 취득
 * (`isOwnedAtTransfer`, 사용자 결정 16). 양도일 현재 보유 주택은 양도 주택 1채(입주권은 다른 주택 0채)다.
 *
 * 종전에는 세어지는 행이 0이면 스칼라(declared)로 폴백해, DateInput 일 1자리 중간 emit(`2025-06-00`)이나
 * 양도일 변경 뒤에 스칼라 2가 남아 ⑧ 0건·과세(181,566,000)가 됐다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | leaf resolve | 날짜 있는 행이 전부 미보유 → offset(주택 1 · 입주권 0). 날짜 있는 행이 없으면 스칼라(D-4) |
 * | L-2 | leaf patch | ⑤ 쓰기 지점 patch·양도일 변경 patch가 스칼라를 offset으로 다시 쓴다 |
 * | R-1 | ⑤→⑧→④→route | 일 「0」→「02」 타이핑·기존 행 정정·입주권 당일 행 → 1채(입주권 0)·비과세 |
 * | R-2 | 양도일 이동 | 양도일을 행 취득일 이전으로 옮겨도 스칼라가 따라간다 |
 * | P-1 | [짝] | 양도 전(2020) 취득 → 2채·과세 / 레거시 표식 → 저장 당시 스칼라 / 행 없음 → 스칼라 |
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import {
  derivedHouseCountPatch,
  houseRosterIsAuthoritative,
  housesPatchWithDerivedCount,
  resolveHouseholdHousingCount,
} from "@/lib/calc/household-house-count";
import { hrow, runCalc } from "./_owned-at-transfer-pr1a-helpers";

const T = "2025-06-02";

function base(kind: string, transferDate: string): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.isOneHousehold = true;
  f.contractTotalPrice = "1000000000";
  f.householdNoPresaleRightsConfirmed = true;
  Object.assign(f.assets[0], {
    assetKind: kind,
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-05",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "400000000",
    addressJibun: "서울특별시 테스트구 1",
    residenceInputMode: "direct",
    residencePeriods: [],
  });
  if (kind === "right_to_move_in")
    Object.assign(f.assets[0], {
      acquisitionDate: "2010-04-09",
      fixedAcquisitionPrice: "300000000",
      redevExemptionEligibleAtApproval: "yes",
      redevSubject: "right",
      redevApprovalDate: "2018-10-23",
      redevApprovalLawBasis: "urban_renovation_art_74",
      redevRightsValue: "500000000",
      redevSettlementDirection: "pay",
      redevSettlementAmount: "50000000",
      redevOriginalAssetType: "housing",
      redevActualAcquisitionPrice: "300000000",
    });
  return f;
}

/** ⑤ 쓰기 지점(`HousesListSection.patchHouses`)과 같은 인자로 매 키 입력마다 patch를 얹는다. */
function type(f: TransferFormData, seq: string[]) {
  Object.assign(f, housesPatchWithDerivedCount([hrow({ id: "B" })], f.assets[0].assetKind, false, f.transferDate));
  for (const acq of seq)
    Object.assign(f, housesPatchWithDerivedCount([hrow({ id: "B", acquisitionDate: acq })], f.assets[0].assetKind, false, f.transferDate));
}

const resolve = (primaryKind: string, declared: number, houses: { acquisitionDate?: string }[], legacyPrecedence = false) =>
  resolveHouseholdHousingCount({ primaryKind, declared, houses, transferDate: T, legacyPrecedence });

describe("L-1 resolveHouseholdHousingCount — 날짜 있는 행이 전부 미보유면 offset", () => {
  it("주택 · 같은 날 1행 → 1 (스칼라 2가 남아 있어도)", () => {
    expect(resolve("housing", 2, [{ acquisitionDate: T }])).toBe(1);
  });
  it("주택 · 양도일 이후 2행 → 1", () => {
    expect(resolve("housing", 3, [{ acquisitionDate: "2025-08-01" }, { acquisitionDate: "2026-01-01" }])).toBe(1);
  });
  it("입주권 · 같은 날 1행 → 0 (다른 주택 0채)", () => {
    expect(resolve("right_to_move_in", 1, [{ acquisitionDate: T }])).toBe(0);
  });
  it("[짝] 양도 전 취득 1행 → 2", () => {
    expect(resolve("housing", 1, [{ acquisitionDate: "2020-01-01" }])).toBe(2);
  });
  it("[짝] 날짜 있는 행이 하나도 없으면(D-4 간이 입력) 스칼라", () => {
    expect(resolve("housing", 2, [])).toBe(2);
    expect(resolve("housing", 2, [{}])).toBe(2);
  });
  it("[짝] 레거시 표식이면 저장 당시 스칼라", () => {
    expect(resolve("housing", 2, [{ acquisitionDate: T }], true)).toBe(2);
  });
});

describe("L-2 파생 patch", () => {
  it("houseRosterIsAuthoritative — 날짜 있는 행이 있으면(전부 미보유여도) 정본", () => {
    expect(houseRosterIsAuthoritative("housing", [{ acquisitionDate: T }])).toBe(true);
    expect(houseRosterIsAuthoritative("housing", [{}])).toBe(false);
  });
  it("housesPatchWithDerivedCount — 전 행 미보유면 스칼라 = offset", () => {
    expect(housesPatchWithDerivedCount([hrow({ acquisitionDate: T })], "housing", false, T).householdHousingCount).toBe("1");
    expect(housesPatchWithDerivedCount([hrow({ acquisitionDate: T })], "right_to_move_in", false, T).householdHousingCount).toBe("0");
  });
  it("derivedHouseCountPatch(양도일 변경 경로) — 양도일을 옮기면 같은 leaf로 다시 센다", () => {
    const houses = [hrow({ acquisitionDate: "2025-06-10" })];
    expect(derivedHouseCountPatch(houses, "housing", false, "2025-06-15")).toEqual({ householdHousingCount: "2" });
    expect(derivedHouseCountPatch(houses, "housing", false, "2025-06-05")).toEqual({ householdHousingCount: "1" });
  });
  it("[짝] derivedHouseCountPatch — 레거시 표식·명부 비정본이면 patch 없음", () => {
    const houses = [hrow({ acquisitionDate: "2025-06-10" })];
    expect(derivedHouseCountPatch(houses, "housing", true, "2025-06-05")).toEqual({});
    expect(derivedHouseCountPatch([hrow({})], "housing", false, "2025-06-05")).toEqual({});
    expect(derivedHouseCountPatch(houses, "presale_right", false, "2025-06-05")).toEqual({});
  });
});

describe("R-1 ⑤→⑧→④→route — 전 행 양도일 이후 취득 → 양도일 현재 1주택", () => {
  it("주택 · 같은 날 취득 행(일 0→02 타이핑) → 1채 · 비과세", async () => {
    const f = base("housing", T);
    type(f, ["2025-06-00", "2025-06-02"]);
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.body.householdHousingCount).toBe(1);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("주택 · 기존 행 취득일을 양도일 당일로 정정 → 1채 · 비과세", async () => {
    const f = base("housing", T);
    type(f, ["2020-01-01", T]);
    const r = await runCalc(f);
    expect(r.body.householdHousingCount).toBe(1);
    expect(r.isExempt).toBe(true);
  });
  it("입주권 · 당일 취득 행 1개(기본 스칼라 1) → 다른 주택 0채", async () => {
    const f = base("right_to_move_in", T);
    type(f, [T]);
    const r = await runCalc(f);
    expect(r.body.householdHousingCount).toBe(0);
    expect(r.isExempt).toBe(true);
  });
});

describe("R-2 양도일 이동", () => {
  it("행 2025-06-10 · 양도일 06-15(2채·과세) → 양도일을 06-05로 옮기면 1채·비과세", async () => {
    const f = base("housing", "2025-06-15");
    type(f, ["2025-06-10"]);
    expect(f.householdHousingCount).toBe("2");
    // handleFormChange가 하는 일 — 양도일 patch에 파생 스칼라를 함께 싣는다
    Object.assign(f, { transferDate: "2025-06-05" }, derivedHouseCountPatch(f.houses, "housing", false, "2025-06-05"));
    const r = await runCalc(f);
    expect(r.body.householdHousingCount).toBe(1);
    expect(r.isExempt).toBe(true);
  });
});

describe("P-1 짝 — 양도 전 취득이면 2채·과세", () => {
  it("행 2020-01-01 → 2채 · 과세 181,566,000", async () => {
    const f = base("housing", T);
    type(f, ["2020-01-01"]);
    const r = await runCalc(f);
    expect(r.body.householdHousingCount).toBe(2);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(181566000);
  });
});

describe("W-1 배선 — 양도일 변경 경로", () => {
  it("TransferTaxCalculator.handleFormChange가 양도일 patch에 파생 스칼라를 싣는다", () => {
    const src = readFileSync("app/calc/transfer-tax/TransferTaxCalculator.tsx", "utf8");
    const body = src.slice(src.indexOf("const handleFormChange"), src.indexOf("// 검증 실패 적용"));
    expect(body).toMatch(/"transferDate" in patch\s*\?\s*derivedHouseCountPatch\(/);
    expect(body).toMatch(/updateFormAndInvalidate\(\{ \.\.\.rosterPatch, \.\.\.patch/);
  });
});
