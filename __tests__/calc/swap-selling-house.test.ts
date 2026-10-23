/**
 * anchor — D6 양도 예정 주택 전환 `swapSellingHouse`(계획서 §4.3 · V-6 · P9). 사용자 결정: 주택 속성은 옮긴다.
 *
 * - SW-1 대응표 「옮김」 칸 전부 — 행 → 양도 주택 → 다시 행으로 왕복해도 값이 같다(옮김 표시만 하고 변환에서 빠진 칸을 잡는다)
 * - SW-2 옛 양도 주택 → 행: 상속·기준시가·배제 사실이 행으로 · 양도 행위 사실은 비우고 고지
 * - SW-3 행에만 있는 칸(농어촌·조특 제외 선언)은 비우고 고지 · 값이 없던 칸은 고지하지 않는다
 * - SW-4 세대 사실은 남고, 다른 행·행 순서는 그대로
 * - SW-5 없는 행 id → 그대로
 */
import { describe, it, expect } from "vitest";
import { ROW_FIELD_DISPOSITION, swapSellingHouse } from "@/lib/calc/swap-selling-house";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const GANGNAM = "1168010100";
const JEONJU = "4511110100";
const BOOL = /^(is|has)|^(litigationPending|dayCareInUse|unavoidableReasonUnresolved|rentIncreaseUnder5Pct|nonHeirBequest|decedentSameHouseholdAtInheritance|parentalCareMergeInheritedHouse|inDesignatedDistrict|oneHouseCulturalHeritage)$/;
const carriedKeys = (Object.entries(ROW_FIELD_DISPOSITION) as [keyof HouseEntry, string][])
  .filter(([, d]) => d === "carried")
  .map(([k]) => k)
  .filter((k) => k !== "id");

function fullRow(id: string): HouseEntry {
  const row = createHouseEntry(id) as unknown as Record<string, unknown>;
  for (const k of carriedKeys) row[k] = BOOL.test(k) ? true : `v-${k}`;
  return { ...(row as unknown as HouseEntry), regionCode: JEONJU, acquisitionDate: "2012-03-04", officialPrice: "250000000" };
}

function form(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate: "2021-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: GANGNAM, standardPriceAtTransfer: "500000000" }],
    houses: [createHouseEntry("h1"), { ...createHouseEntry("h2"), regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "400000000" }],
    ...over,
  } as OneHouseJudgmentFormData;
}

describe("SW-1 대응표 「옮김」 칸 왕복", () => {
  it("행 → 양도 주택 → 행: 「옮김」 칸 전부 같은 값", () => {
    const row = fullRow("h1");
    const once = swapSellingHouse(form({ houses: [row] }), "h1").form;
    expect(once.assets[0].regionCode).toBe(JEONJU);
    expect(once.assets[0].acquisitionCause).toBe("inheritance");
    const back = swapSellingHouse(once, "h1").form.houses[0] as unknown as Record<string, unknown>;
    const mismatched = carriedKeys.filter((k) => JSON.stringify(back[k]) !== JSON.stringify((row as unknown as Record<string, unknown>)[k]));
    expect(mismatched).toEqual([]);
  });
});

describe("SW-2 옛 양도 주택 → 행", () => {
  it("상속·기준시가·사원용 사실은 행으로 · 양도가액·거주기간·11호·조특 배제는 비우고 고지", () => {
    const f = form({
      sellingHouseExclusion: { isEmployeeHousing: true, freeProvisionYears: "12", isTaxSpecialExemption: true, saleDepositReceived: true, saleContractDate: "2020-01-01" },
    });
    f.assets[0] = { ...f.assets[0], acquisitionCause: "inheritance", inheritanceDate: "2014-05-05", residencePeriodMonthsAsset: "24" };
    const { form: next, cleared } = swapSellingHouse(f, "h2");
    const row = next.houses[1];
    expect([row.id, row.isInherited, row.inheritedDate, row.officialPrice, row.regionCode, row.region]).toEqual([
      "h2", true, "2014-05-05", "500000000", GANGNAM, "capital",
    ]);
    expect([row.isEmployeeHousing, row.freeProvisionYears]).toEqual([true, "12"]);
    expect(next.assets[0].regionCode).toBe(GANGNAM);
    expect(next.assets[0].standardPriceAtTransfer).toBe("400000000");
    expect(next.contractTotalPrice).toBe("");
    expect(next.sellingHouseExclusion).toBeUndefined();
    expect(cleared).toEqual(expect.arrayContaining(["예상 양도가액", "거주기간", "공고 전 매매계약(11호)", "조세특례제한법 감면 중과 배제 선언"]));
  });

  it("장기임대·조특 감면 임대 — 공유 칸(임대기간·아파트)은 2호 칸 값으로 행 한 칸에", () => {
    const f = form({
      sellingHouseExclusion: {
        longTermRental: { isLongTermRental: true, rentalType: "B", rentalPeriodYears: "8", isApartment: true, isNationalSizeHousing: true },
        taxIncentiveRental: { isTaxIncentiveRental: true, rentalPeriodYears: "3", isApartment: false },
      },
    });
    const row = swapSellingHouse(f, "h2").form.houses[1];
    expect([row.isLongTermRental, row.rentalType, row.rentalPeriodYears, row.isApartment, row.isTaxIncentiveRental]).toEqual([true, "B", "8", true, true]);
  });
});

describe("SW-3 행에만 있는 칸", () => {
  it("농어촌주택·조특 주택 수 제외 선언은 비우고 고지 · 값 없는 칸은 고지하지 않는다", () => {
    const f = form();
    f.houses[1] = { ...f.houses[1], oneHouseRuralHouse: true, countExclusion: { article: "99-4" } as never };
    const { cleared } = swapSellingHouse(f, "h2");
    expect(cleared).toEqual(expect.arrayContaining(["농어촌주택 사실(§155⑦)", "조세특례제한법 주택 수 제외 선언"]));
    expect(cleared).not.toContain("인구감소지역 사실");
  });
  it("아파트 여부는 임대 사실로 옮겨지면 고지하지 않고, 임대가 없으면 고지한다", () => {
    const f = form();
    f.houses[1] = { ...f.houses[1], isApartment: true, isLongTermRental: true, rentalType: "B" };
    expect(swapSellingHouse(f, "h2").cleared).not.toContain("아파트 여부");
    f.houses[1] = { ...f.houses[1], isApartment: true, isLongTermRental: false };
    expect(swapSellingHouse(f, "h2").cleared).toContain("아파트 여부");
  });
  it("§155① 취득 경위 — 「일반 취득」은 고지하지 않고 분양권 취득은 고지한다", () => {
    const f = form();
    f.houses[1] = { ...f.houses[1], acquisitionOrigin: "general" };
    expect(swapSellingHouse(f, "h2").cleared).toEqual(["예상 양도가액"]);
    f.houses[1] = { ...f.houses[1], acquisitionOrigin: "presale", rightAcquisitionDate: "2008-01-01" };
    expect(swapSellingHouse(f, "h2").cleared).toContain("신규 주택 취득 경위(§155① — 분양권·입주권·재건축)");
  });
  it("식별 사실만 있으면 양도가액 말고는 고지할 것이 없다", () => {
    expect(swapSellingHouse(form(), "h2").cleared).toEqual(["예상 양도가액"]);
  });
  it("팩토리 기본값이 없는 키(시드·이력 행)의 빈 값·false는 고지하지 않는다 — 실제 값만", () => {
    const f = form();
    const bare = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "400000000", isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false };
    f.houses[1] = bare as HouseEntry;
    expect(swapSellingHouse(f, "h2").cleared).toEqual(["예상 양도가액"]);
    f.houses[1] = { ...bare, isSpouseOwned: true } as HouseEntry;
    expect(swapSellingHouse(f, "h2").cleared).toContain("배우자 보유·합가 사실");
  });
  it("새 양도 주택은 분리 OFF 불변식대로 토지 취득일 = 취득일", () => {
    expect(swapSellingHouse(form(), "h2").form.assets[0].landAcquisitionDate).toBe("2010-01-01");
  });
});

describe("SW-4·5", () => {
  it("[SW-4] 세대 사실(세대·양도일·권리 목록·혼인일)은 남고 다른 행·순서는 그대로", () => {
    const f = form({ isOneHousehold: true, marriageDate: "2019-01-01", presaleRights: [{ id: "r1" } as never] });
    const next = swapSellingHouse(f, "h2").form;
    expect([next.isOneHousehold, next.transferDate, next.marriageDate, next.presaleRights.length]).toEqual([true, "2021-06-01", "2019-01-01", 1]);
    expect(next.houses.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(next.houses[0]).toBe(f.houses[0]);
  });
  it("[SW-6] 얕은 병합(store updateFormData)으로 덮어도 옛 양도 주택 값이 남지 않는다 — 한시 유예 나·다목", () => {
    const f = form({ gracePeriod: { basis: "na" } as never });
    const { form: next, cleared } = swapSellingHouse(f, "h2");
    expect({ ...f, ...next }.gracePeriod).toBeUndefined();
    expect(cleared).toContain("한시 유예 나·다목 사실");
  });
  it("[SW-5] 없는 행 id → 그대로", () => {
    const f = form();
    expect(swapSellingHouse(f, "nope")).toEqual({ form: f, cleared: [] });
  });
});
