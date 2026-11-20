/**
 * D-03 anchor — §155①(일시적 2주택) + §155④·⑤(합가) 중첩 3주택에서 혼인일·동거봉양 합가일이 **둘 다** 있으면 명부 소유 쪽으로 축을 고른다.
 *
 * S04-3은 축 선택(`resolveTwoHouseMergeAxis`)을 2주택에만 고쳤다. 3주택 중첩은 늘 혼인 축을 봐서 양방향으로 틀렸다.
 * - A형(과다 과세): 무주택 배우자와 혼인(2010) → 신규 주택 N(2024-01-10) → 1주택 부친 P와 동거봉양 합가(2024-06-01).
 *   ④ 중첩(부동산거래관리과-48 · 사전-2025-법규재산-1240)인데 혼인일을 함께 넣으면 혼인 축(⑤ — 「1주택을 보유하는 자와 혼인」 아님)으로 과세.
 * - B형(거짓 비과세): 1주택 부친 P와 동거봉양 합가(2008 — 10년 경과) → 무주택 배우자와 혼인(2023). 혼인 축으로 보아 비과세.
 * 두 쪽 행(먼저 합친 쪽 · 나중에 합친 쪽)이 모두 있는 3주택은 이중 합가(D4 — `resolveDoubleMergeDeeming`)라 이 축이 아니다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

type Row = Record<string, unknown>;
function menu(o: { marriage?: string; parental: string; assetAcq: string; p: Row; extra?: Row[] }): RulingCase {
  return {
    id: "d03", docNo: "-", docDate: "-", basis: "current", today: "2025-06-02", summary: "d03", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2025-06-01",
      contractTotalPrice: "800000000",
      ...(o.marriage ? { marriageDate: o.marriage } : {}),
      parentalCareMergeDate: o.parental,
      parentalCareParentAge: "over_60",
      isFirstTransferredInMerge: true,
      asset: { assetKind: "housing", acquisitionDate: o.assetAcq },
      houses: [
        { id: "p", region: "non_capital", acquisitionDate: "1995-01-01", ...o.p },
        { id: "n", region: "non_capital", acquisitionDate: "2024-01-10", mergeOrigin: "seller_side", acquisitionOrigin: "general" },
        ...(o.extra ?? []),
      ],
    } as unknown as RulingCase["form"],
  };
}

const A_TYPE = { parental: "2024-06-01", assetAcq: "2015-03-01" };
const B_TYPE = { parental: "2008-03-01", assetAcq: "2005-03-01" };

describe("D-03 A형 — 무주택 배우자 혼인 뒤 일시적 2주택 상태에서 1주택 부친과 동거봉양 합가", () => {
  it("대조 — 동거봉양 합가일만 넣으면 §155①·④ 중첩 비과세", async () => {
    const o = await observeCase(menu({ ...A_TYPE, p: { mergeOrigin: "counterpart_side" } }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-4-parental-care-merge"]));
  });

  it("혼인일(2010)을 함께 넣고 P를 「나중에 합친 쪽」으로 두면 동거봉양 축 — 같은 비과세", async () => {
    const o = await observeCase(menu({ ...A_TYPE, marriage: "2010-03-01", p: { mergeOrigin: "second_merge_side" } }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-4-parental-care-merge"]));
  });
});

describe("D-03 B형 — 1주택 부친과 동거봉양 합가(10년 경과) 뒤 무주택 배우자와 혼인", () => {
  it("P를 「먼저 합친 쪽」으로 두면 동거봉양 축 — 10년 경과로 과세(혼인 축 비과세가 아니다)", async () => {
    const o = await observeCase(menu({ ...B_TYPE, marriage: "2023-03-01", p: { mergeOrigin: "counterpart_side" } }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("155-5-marriage-merge");
  });
});

describe("D-03 회귀 — 혼인 축이 맞는 중첩", () => {
  it("1주택 배우자와 혼인(2022) 뒤 신규 취득 · 무주택 부친과 합가(2024) — 혼인 축 §155①·⑤ 비과세", async () => {
    const o = await observeCase(
      menu({ parental: "2024-06-01", marriage: "2022-03-01", assetAcq: "2015-03-01", p: { mergeOrigin: "counterpart_side" } }),
    );
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-5-marriage-merge"]));
  });
});

describe("Q-15 — 3주택 · 두 합가일 · D4 구성이 아니면 「합가 전 보유자로 축을 고릅니다」 비차단 안내", () => {
  const notice = (c: RulingCase) =>
    validateAllSteps(buildCaseForm(c)).filter((e) => e.severity === "warning" && e.message.includes("합가 전 보유자로 어느 합가인지 고릅니다"));
  it("한쪽 행만 있으면 안내한다(차단 아님)", () => {
    expect(notice(menu({ ...A_TYPE, marriage: "2010-03-01", p: { mergeOrigin: "second_merge_side" } }))).toHaveLength(1);
  });
  it("두 쪽 행이 다 있는 이중 합가(D4)는 안내하지 않는다", () => {
    const d4 = menu({
      ...A_TYPE,
      marriage: "2010-03-01",
      p: { mergeOrigin: "second_merge_side" },
      extra: [{ id: "s", region: "non_capital", acquisitionDate: "2005-01-01", mergeOrigin: "counterpart_side" }],
    });
    // n(2024 신규)을 빼서 3주택 이중 합가 모양으로 둔다
    (d4.form as unknown as { houses: Row[] }).houses = (d4.form as unknown as { houses: Row[] }).houses.filter((h) => h.id !== "n");
    expect(notice(d4)).toHaveLength(0);
  });
  it("동거봉양 합가일만 있으면 안내하지 않는다", () => {
    expect(notice(menu({ ...A_TYPE, p: { mergeOrigin: "counterpart_side" } }))).toHaveLength(0);
  });
});

describe("D-03 계산기 엔진(calculateTransferTax) — 같은 축", () => {
  const h = (id: string, acq: string, mergeOrigin?: string) => ({
    id, acquisitionDate: new Date(acq), officialPrice: 300_000_000, region: "non_capital" as const, isInherited: false,
    isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...(mergeOrigin ? { mergeOrigin } : {}),
  });
  const input = (marriage: string | undefined, parental: string, assetAcq: string, pSide: string): TransferTaxInput =>
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionDate: new Date(assetAcq),
      transferDate: new Date("2025-06-01"),
      isRegulatedArea: false,
      householdHousingCount: 3,
      houses: [h("selling", assetAcq), h("p", "1995-01-01", pSide), h("n", "2024-01-10", "seller_side")] as TransferTaxInput["houses"],
      sellingHouseId: "selling",
      ...(marriage ? { marriageMerge: { marriageDate: new Date(marriage) } } : {}),
      parentalCareMerge: { mergeDate: new Date(parental), parentAge: "over_60" as const },
      isFirstTransferredInMerge: true,
      temporaryTwoHouse: { previousAcquisitionDate: new Date(assetAcq), newAcquisitionDate: new Date("2024-01-10") },
    });
  const calc = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  it("A형 — 혼인일을 더해도 동거봉양 중첩 비과세", () => {
    expect(calc(input("2010-03-01", "2024-06-01", "2015-03-01", "second_merge_side")).isExempt).toBe(true);
  });
  it("B형 — 동거봉양 10년 경과 · 무주택 배우자 혼인은 과세", () => {
    expect(calc(input("2023-03-01", "2008-03-01", "2005-03-01", "counterpart_side")).isExempt).toBe(false);
  });
});
