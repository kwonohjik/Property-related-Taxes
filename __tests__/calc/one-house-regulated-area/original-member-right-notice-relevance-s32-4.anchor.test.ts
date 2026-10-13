/**
 * #32-4 anchor — 기존주택 원조합원 입주권 행의 「지정 지구 안인가」 미선언 고지는 **그 선언이 결론을 가를 때만** 낸다.
 *
 * 결정 #32(「결론을 가르지 않는 조정대상지역·공휴일 판정 보류 고지 정리」)의 하위 4 — 이미 머지된 #32-1~3(#2147)·양도 주택 고지(S02-7)와
 * 같은 규약이다: 모르는 사실을 다른 독법으로 바꿔 **판정 전체를 다시 돌렸을 때** 비과세·부분 비과세 여부가 달라지는지로 정한다.
 *
 * 시료 — 삼송동(4128111100)은 고양시 지구 한정 지정 동(2019.11.8.~2020.6.18.). 입주권 행(원조합원) 기존주택 취득일 2020-01-01.
 *   · 판정 메뉴: 양도 주택 2015-01-01 취득·강남·거주 60개월.
 *   · 계산기: 같은 모양(양도 주택 강남 = 조정, 그 외 비조정).
 * 지구 밖이면 두 주택이 모두 조정은 아니라 처분기한 3년(2023-01-01까지), 지구 안이면 모두 조정이라 1년 체제(전입 요건).
 *
 *   결론을 가름(고지 유지) : 양도 2022-06-01 — 미선언 과세 ↔ 지구 밖 비과세
 *   결론이 같음(고지 없음)
 *     ① 양도 2024-03-01 — 어느 쪽이든 3년(2023-01-01)을 넘겨 과세
 *     ② 양도 주택 보유·거주 1년 미만 — 어느 쪽이든 §154① 미충족 과세
 *     ③ (계산기) 양도 주택이 조정이 아니면 어느 쪽이든 비과세
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("anchor: fallback")) };
});

import { observeCase, type RulingCase } from "../one-house-rulings/harness";
import { newForm, runCalc } from "../_one-house-pr3a-calc-route";
import { designatedDistrictUndeclared } from "@/lib/tax-engine/one-house/designated-district-undeclared";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

const SAMSONG = "4128111100";
const ID = "regulated-district-undeclared:right-0";

// ───────────────────────── 판정 메뉴 ─────────────────────────
async function menu(o: { transfer: string; district?: boolean; holdingStart?: string; residence?: string }) {
  const c: RulingCase = {
    id: "s32-4", docNo: "-", docDate: "-", basis: "era", today: o.transfer, summary: "s32-4", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: "1000000000",
      presaleRights: [
        {
          id: "r0", type: "redevelopment_right", memberOrigin: "original_house", acquisitionDate: "2020-01-01", region: "capital",
          regionCode: SAMSONG, inDesignatedDistrict: o.district, managementDisposalApprovalDate: "2019-06-01",
        },
      ],
      asset: {
        assetKind: "housing", acquisitionDate: o.holdingStart ?? "2015-01-01", regionCode: "1168010100",
        residenceInputMode: "direct", residencePeriodMonthsAsset: o.residence ?? "60",
      },
    } as RulingCase["form"],
  };
  return observeCase(c);
}

describe("#32-4 판정 메뉴 — 입주권 행 지구 고지는 결론을 가를 때만", () => {
  it("결론을 가름 — 양도 2022-06-01: 미선언 과세 + 고지 / 지구 밖 비과세", async () => {
    const u = await menu({ transfer: "2022-06-01" });
    expect(u.isExempt).toBe(false);
    expect(u.undetermined).toContain(ID);
    const out = await menu({ transfer: "2022-06-01", district: false });
    expect(out.isExempt).toBe(true);
    expect(out.undetermined).not.toContain(ID);
  });

  it("① 처분기한(2023-01-01)을 어느 독법으로도 넘긴 양도 2024-03-01 — 과세는 같고 고지 없음", async () => {
    const [none, inside, outside] = [
      await menu({ transfer: "2024-03-01" }),
      await menu({ transfer: "2024-03-01", district: true }),
      await menu({ transfer: "2024-03-01", district: false }),
    ];
    expect([none.isExempt, inside.isExempt, outside.isExempt]).toEqual([false, false, false]);
    expect(none.undetermined).not.toContain(ID);
  });

  it("② 양도 주택 보유·거주가 모자라(1년 미만) 어차피 과세 — 고지 없음", async () => {
    const o = { transfer: "2022-06-01", holdingStart: "2021-12-01", residence: "0" };
    const [none, outside] = [await menu(o), await menu({ ...o, district: false })];
    expect([none.isExempt, outside.isExempt]).toEqual([false, false]);
    expect(none.undetermined).not.toContain(ID);
  });
});

// ───────────────────────── 계산기 ─────────────────────────
function calcForm(o: { transfer: string; regulatedSell: boolean; district?: boolean }) {
  const f = newForm();
  f.transferDate = o.transfer; f.isOneHousehold = true; f.householdHousingCount = "1"; f.householdNoOtherHousesConfirmed = true;
  f.contractTotalPrice = "900000000"; f.residencePeriodMonths = "0"; f.isRegulatedArea = o.regulatedSell; f.wasRegulatedAtAcquisition = o.regulatedSell;
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "900000000",
    fixedAcquisitionPrice: "500000000", addressJibun: "테스트 주소 1", regionCode: o.regulatedSell ? "1168010100" : "4311000000",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "60",
  });
  f.presaleRights = [{
    id: "r1", type: "redevelopment_right", acquisitionDate: "2020-01-01", region: "capital", memberOrigin: "original_house",
    regionCode: SAMSONG, inDesignatedDistrict: o.district, managementDisposalApprovalDate: "2019-01-01",
  } as never];
  return f;
}
const districtWarnings = (w: string[] = []) => w.filter((s) => s.includes("삼송택지개발지구"));

describe("#32-4 계산기 — 같은 collector라 경고도 같은 규약", () => {
  it("결론을 가름 — 양도 2022-06-01 강남: 미선언 과세 + 경고 / 지구 밖 비과세·경고 없음", async () => {
    const u = await runCalc(calcForm({ transfer: "2022-06-01", regulatedSell: true }));
    expect(u.status).toBe(200);
    expect(u.isExempt).toBe(false);
    expect(districtWarnings(u.warnings)).toHaveLength(1);
    const out = await runCalc(calcForm({ transfer: "2022-06-01", regulatedSell: true, district: false }));
    expect(out.isExempt).toBe(true);
    expect(districtWarnings(out.warnings)).toHaveLength(0);
  });

  it("① 처분기한을 어느 독법으로도 넘긴 양도 2024-03-01 — 세액이 같고 경고 없음", async () => {
    const [none, inside, outside] = [
      await runCalc(calcForm({ transfer: "2024-03-01", regulatedSell: true })),
      await runCalc(calcForm({ transfer: "2024-03-01", regulatedSell: true, district: true })),
      await runCalc(calcForm({ transfer: "2024-03-01", regulatedSell: true, district: false })),
    ];
    expect(none.totalTax).toBeGreaterThan(0);
    expect(inside.totalTax).toBe(none.totalTax);
    expect(outside.totalTax).toBe(none.totalTax);
    expect(districtWarnings(none.warnings)).toHaveLength(0);
  });

  it("③ 양도 주택이 조정이 아니면 어느 쪽이든 비과세 — 경고 없음", async () => {
    const [none, outside] = [
      await runCalc(calcForm({ transfer: "2022-06-01", regulatedSell: false })),
      await runCalc(calcForm({ transfer: "2022-06-01", regulatedSell: false, district: false })),
    ];
    expect([none.isExempt, outside.isExempt]).toEqual([true, true]);
    expect(districtWarnings(none.warnings)).toHaveLength(0);
  });
});

// ───────────────────────── gate leaf ─────────────────────────
describe("#32-4 gate leaf — `relevance.right(i)`", () => {
  const D = (s: string) => new Date(s);
  const input = {
    ...baseTransferInput({ propertyType: "housing", isOneHousehold: true, transferDate: D("2020-05-15"), acquisitionDate: D("2016-03-02") }),
    presaleRights: [
      { id: "r", type: "redevelopment_right" as const, acquisitionDate: D("2020-01-15"), region: "capital" as const, regionCode: "4128710400", memberOrigin: "original_house" as const },
    ],
  };
  const selling = () => false;

  it("right(i)가 거짓이면 고지하지 않는다 · 인자는 입주권 행 번호", () => {
    const seen: number[] = [];
    expect(designatedDistrictUndeclared(input, { selling, right: (i) => (seen.push(i), false) })).toEqual([]);
    expect(seen).toEqual([0]);
  });
  it("긍정 짝 — right(i)가 참이면 고지 · relevance를 안 넘기면 게이트 없음(기존 호출부 호환)", () => {
    expect(designatedDistrictUndeclared(input, { selling, right: () => true }).map((x) => x.id)).toEqual([ID]);
    expect(designatedDistrictUndeclared(input).map((x) => x.id)).toEqual([ID]);
  });
  it("양도 주택 게이트(selling)와 독립 — right만 거짓이어도 selling 고지는 selling 게이트가 정한다", () => {
    const both = { ...input, regionCode: "4159710200", acquisitionDate: D("2018-01-02") };
    const ids = designatedDistrictUndeclared(both, { selling: () => true, right: () => false }).map((x) => x.id);
    expect(ids).toEqual(["regulated-district-undeclared:selling"]);
  });
});
