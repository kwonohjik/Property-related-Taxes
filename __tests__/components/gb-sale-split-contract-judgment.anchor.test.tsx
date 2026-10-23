/**
 * 공유지분 일반건물 §100③ — 계약서(100%) 금액으로 판정하고 결론만 지분에 적용 (2026-10-23)
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` (Q-1 a · Q-2 a · Q-3 a) — PR-1(일반건물).
 * 폼 → ④ → route POST(mock 세율) → `BundledAllocationCard` 렌더.
 *
 * - 종전: 계약서 구분 기재를 지분율로 버림한 값과 지분 양도가액에서 따로 버림된 안분 가액을 비교해, 30% 근처에서 100% 판정과
 *   결론이 뒤집혔다. 축 B는 같은 계약서의 지분끼리 결론이 달랐다.
 * - 기대 세액 = 「100% 결론을 그 지분에 적용한 세액」. 100%가 불분명이면 안분 모드 세액, 구분 기재 적용이면 예외 사유로
 *   구분 기재를 강제한 세액이다(둘 다 이 PR과 무관한 경로).
 * - 건물 취득일 2021 — 토지(2005)와 장특 율이 달라야 배분이 세액을 바꾼다(둘 다 15년 넘으면 결함이 가려진다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, LAND, T, asset, form, run } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BUY: Partial<AssetForm> = { ...GB_SAMPLES["S100-act"][0][0], acquisitionDate: "2021-05-01" };
const split = (land: number): Partial<AssetForm> => ({ landTransferPrice: String(land), buildingTransferPrice: String(T - land) });
const own = (n: string, d: string): Partial<AssetForm> => ({ ownershipNumerator: n, ownershipDenominator: d });
/** 불분명 결론을 지분에 적용한 세액 — 구분 기재 없이 안분. */
const APPORTIONED: Partial<AssetForm> = { saleSplitMode: "apportioned" };
/** 구분 기재 적용 결론을 지분에 적용한 세액 — §166⑧ 예외로 구분 기재를 강제(근거 문구는 ⑧만 본다). */
const FORCE_DECLARED: Partial<AssetForm> = { saleSplitExemption: "other_law", saleSplitExemptionNote: "probe" };

async function single(land: number, ratio: Partial<AssetForm>, ...over: Partial<AssetForm>[]) {
  const r = await run(form(T, [asset(1, BUY, split(land), ratio, ...over)]));
  expect(r.status).toBe(200);
  return r;
}

describe("단건 공유지분 — 지분 판정 = 100% 판정 · 세액 = 100% 결론을 지분에 적용한 세액", () => {
  // [지분, 토지 구분 기재, 100% 결론(불분명?), 종전 지분 결론] — 2026-10-23 실측 경계 시료(계획서 §1)
  const CASES: Array<[string, string, number, boolean, boolean]> = [
    ["1", "3", 1_212_167_733, true, false],
    ["2", "3", 1_212_167_735, true, false],
    ["1", "7", 1_212_167_730, true, false],
    ["1", "3", 1_391_167_242, false, true],
    ["2", "3", 1_391_167_242, false, true],
    ["1", "7", 1_391_167_239, false, true],
    ["37", "100", 1_391_167_241, false, true],
  ];
  it.each(CASES)("지분 %s/%s · 토지 %d → 100% 불분명 %s (종전 지분 판정 %s)", async (n, d, land, deemed100) => {
    const r100 = await run(form(T, [asset(1, BUY, split(land))]));
    expect(r100.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!.deemedUnclear).toBe(deemed100);

    const r = await single(land, own(n, d));
    const j = r.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!;
    expect(j.deemedUnclear).toBe(deemed100);
    // 판정 표 = 계약서(100%) — 단건 100%의 판정과 같다.
    const j100 = r100.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!;
    expect({ declared: j.declared, apportioned: j.apportioned, applied: j.applied, bp: [j.landDeviationBp, j.buildingDeviationBp] })
      .toEqual({ declared: j100.declared, apportioned: j100.apportioned, applied: j100.applied, bp: [j100.landDeviationBp, j100.buildingDeviationBp] });
    expect(j.share!.ownershipRatio).toBeCloseTo(Number(n) / Number(d), 12);

    const expected = await single(land, own(n, d), deemed100 ? APPORTIONED : FORCE_DECLARED);
    expect(r.aggregated.determinedTax).toBe(expected.aggregated.determinedTax);
    // 지분 적용 가액 = 그 결론의 지분 몫 값(Q-2 a) — 안분 모드·구분 기재 강제의 카드 양도가액과 같다.
    const landCard = (x: typeof r) => x.aggregated.properties.find((p) => p.propertyId === "land")!.transferPrice;
    expect(j.share!.applied.land).toBe(landCard(expected));
    expect(landCard(r)).toBe(landCard(expected));
  });

  it("세액 실측값(계획서 §1) — 1/3 · 토지 1,212,167,733: 73,010,926 → 70,516,866", async () => {
    expect((await single(1_212_167_733, own("1", "3"))).aggregated.determinedTax).toBe(70_516_866);
  });

  it("결과 화면 — 판정 표는 계약서 금액, 아래 「지분 33.33% 적용 가액」 행", async () => {
    const f = form(T, [asset(1, BUY, split(1_212_167_733), own("1", "3"))]);
    const r = await run(f);
    render(<BundledAllocationCard apportionment={r.apportionment} aggregated={r.aggregated} formData={f} />);
    const block = (screen.getByTestId("sale-split-judgment").textContent ?? "").replace(/\s+/g, " ");
    const share = r.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!.share!.applied;
    expect(block).toContain("구분 기재 가액을 인정하지 않고 안분가액을 적용했습니다");
    expect(block).toContain(`구분 기재 가액${(1_212_167_733).toLocaleString()}${(T - 1_212_167_733).toLocaleString()}`);
    expect(block).toContain(`지분 33.33% 적용 가액${share.land.toLocaleString()}${share.building.toLocaleString()}`);
  });

  it("단독 소유는 지분 행 없이 종전 그대로", async () => {
    const r = await single(1_212_167_733, {});
    expect(r.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!.share).toBeUndefined();
  });

  it("한쪽만 기재(토지) — 계약 총액(100%)으로 건물을 정해 판정한다", async () => {
    const r = await single(1_212_167_733, own("1", "3"), { buildingTransferPrice: "" });
    const j = r.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!;
    expect(j.declared).toEqual({ land: 1_212_167_733, building: T - 1_212_167_733 });
    expect(j.deemedUnclear).toBe(true);
  });
});

describe("함께 양도 — 지분 일반건물(컴패니언)도 계약서 금액으로 판정", () => {
  // 함께 양도 실가 모드의 총 양도가액 = 자산별 양도가액 합 — 지분 일반건물은 지분 몫(1.6억 × 1/3 = 533,333,333)으로 더한다(⑧).
  it.each([["주 자산", true], ["컴패니언", false]] as const)("일반건물 1/3 지분이 %s · 토지 1,212,167,733 → 불분명 · 세액 = 안분 모드", async (_, gbFirst) => {
    const bundle = (...over: Partial<AssetForm>[]) => {
      const gb = (n: number) => asset(n, BUY, split(1_212_167_733), own("1", "3"), ...over);
      return form(833_333_333, gbFirst ? [gb(1), asset(2, LAND)] : [asset(1, LAND), gb(2)], {
        assetSplitMode: "companion",
        bundledSaleMode: "actual",
      } as never);
    };
    const r = await run(bundle());
    expect(r.status).toBe(200);
    const id = Object.keys(r.aggregated.generalBuildingDetailsByAsset!)[0];
    const j = r.aggregated.generalBuildingDetailsByAsset![id].saleSplitJudgment!;
    expect(j.deemedUnclear).toBe(true);
    expect(j.declared).toEqual({ land: 1_212_167_733, building: T - 1_212_167_733 });
    expect(j.share).toBeDefined();
    expect(r.aggregated.determinedTax).toBe((await run(bundle(APPORTIONED))).aggregated.determinedTax);
  });

  it.each([["주 자산", true], ["컴패니언", false]] as const)("%s · 한쪽만 기재(토지) — 그 물건 전체 양도가액으로 건물을 정해 계약서로 판정", async (_, gbFirst) => {
    const gb = (n: number) => asset(n, BUY, split(1_212_167_733), { buildingTransferPrice: "" }, own("1", "3"));
    const r = await run(form(833_333_333, gbFirst ? [gb(1), asset(2, LAND)] : [asset(1, LAND), gb(2)], {
      assetSplitMode: "companion",
      bundledSaleMode: "actual",
    } as never));
    expect(r.status).toBe(200);
    const j = Object.values(r.aggregated.generalBuildingDetailsByAsset!)[0].saleSplitJudgment!;
    expect(j.declared).toEqual({ land: 1_212_167_733, building: T - 1_212_167_733 });
    expect(j.deemedUnclear).toBe(true);
  });
});

describe("축 B — 같은 계약서의 지분은 결론이 하나", () => {
  it.each([
    [1_212_167_734, true],
    [1_391_167_243, true],
    [1_391_167_240, false],
  ] as const)("1/3 + 2/3 · 토지 %d → 전 지분 불분명 %s · 물건 전체 판정 1개", async (land, deemed) => {
    const shares = (...over: Partial<AssetForm>[]) => form(T, [
      asset(1, BUY, split(land), own("1", "3"), ...over),
      asset(2, BUY, split(land), own("2", "3"), { acquisitionDate: "2022-05-01" }, ...over),
    ]);
    const r = await run(shares());
    const d = r.aggregated.generalBuildingValuationDetail!;
    expect(Object.values(d.shareBlockEcho!).map((e) => e.saleSplitJudgment!.deemedUnclear)).toEqual([deemed, deemed]);
    expect(d.saleSplitJudgment!.deemedUnclear).toBe(deemed);
    expect(d.saleSplitJudgment!.declared).toEqual({ land, building: T - land });
    expect(d.saleSplitJudgment!.share).toBeUndefined();
    const expected = await run(shares(deemed ? APPORTIONED : FORCE_DECLARED));
    expect(r.aggregated.determinedTax).toBe(expected.aggregated.determinedTax);
  });

  it("한쪽만 기재(토지) — 총양도가(계약 총액)로 건물을 정해 전 지분이 같은 계약서로 판정", async () => {
    const land = 1_212_167_734;
    const r = await run(form(T, [
      asset(1, BUY, split(land), { buildingTransferPrice: "" }, own("1", "3")),
      asset(2, BUY, split(land), { buildingTransferPrice: "" }, own("2", "3"), { acquisitionDate: "2022-05-01" }),
    ]));
    const d = r.aggregated.generalBuildingValuationDetail!;
    expect(d.saleSplitJudgment!.declared).toEqual({ land, building: T - land });
    expect(Object.values(d.shareBlockEcho!).map((e) => e.saleSplitJudgment!.deemedUnclear)).toEqual([true, true]);
  });
});
