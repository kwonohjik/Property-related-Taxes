/**
 * 공유지분 주택 구분양도 §100③ — 계약서(100%) 금액으로 판정하고 결론만 지분에 적용 (2026-10-23)
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` PR-2 (Q-1 a · Q-2 a · Q-4 a).
 * 폼 → ④ → route POST(mock 세율). 엔진 경계 탐색은 아래 `resolveTransferPriceSplit` 단위 블록.
 *
 * 시료: 총 15억 · 양도시 기준시가 토지 10억 / 건물 5억(안분 건물 5억) · 계약서 토지 8.5억 / 건물 6.5억 — 건물 **정확히 +30%**.
 * 100% 판정은 「불분명」인데, 종전에는 지분 몫으로 줄여(1/3: 216,666,666 vs 안분 166,666,667) 「30% 미만」이 됐다.
 * 건물 2024 취득 · 토지 2003 — 장특 율이 달라 배분이 세액을 바꾼다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { asset, form, run } from "../components/_helpers/gb-bundled-blocks-fixtures";
import { resolveTransferPriceSplit } from "@/lib/tax-engine/transfer-tax-split-sale-price";
import { NextRequest } from "next/server";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_500_000_000;
const HOUSE: Partial<AssetForm> = {
  assetKind: "housing",
  addressJibun: "서울 강남구 역삼동 9",
  acquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2003-05-01",
  acquisitionDate: "2024-03-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300000000",
  buildingAcquisitionPrice: "200000000",
  fixedAcquisitionPrice: "200000000",
  landStandardPriceAtTransfer: "1000000000",
  buildingStandardPriceAtTransfer: "500000000",
  actualSalePrice: String(T),
  saleSplitMode: "actual",
  landTransferPrice: "850000000",
  buildingTransferPrice: "650000000",
  ownershipRemainderThirdParty: "yes",
};
const MULTI = { householdHousingCount: "3", isOneHousehold: false } as never;
const own = (n: string, d: string): Partial<AssetForm> => ({ ownershipNumerator: n, ownershipDenominator: d });
/** 불분명 결론을 지분에 적용한 세액 — 구분 기재 없이 안분. */
const APPORTIONED: Partial<AssetForm> = { saleSplitMode: "apportioned" };
/** 구분 기재 결론을 지분에 적용 — §166⑧ 예외로 구분 기재를 강제. */
const FORCE_DECLARED: Partial<AssetForm> = { saleSplitExemption: "other_law", saleSplitExemptionNote: "probe" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const splitOf = (r: Awaited<ReturnType<typeof run>>, i = 0): any => r.data?.result?.splitDetail ?? r.aggregated?.properties?.[i]?.splitDetail;
const taxOf = (r: Awaited<ReturnType<typeof run>>): number => r.data?.result?.determinedTax ?? r.aggregated.determinedTax;
const single = (ratio: Partial<AssetForm>, ...over: Partial<AssetForm>[]) => run(form(T, [asset(1, HOUSE, ratio, ...over)], MULTI));

describe("단건 공유지분 — 정확히 +30% 계약서는 지분이어도 「불분명」", () => {
  it.each([["1", "3"], ["2", "3"], ["1", "7"]])("지분 %s/%s → 100%와 같은 결론 · 세액 = 안분 모드 세액", async (n, d) => {
    const r100 = await single({});
    expect(splitOf(r100).saleSplitJudgment.deemedUnclear).toBe(true);
    const r = await single(own(n, d));
    expect(r.status).toBe(200);
    const j = splitOf(r).saleSplitJudgment;
    expect(j.deemedUnclear).toBe(true);
    expect(j.declared).toEqual({ land: 850_000_000, building: 650_000_000 });
    expect(j.apportioned).toEqual(splitOf(r100).saleSplitJudgment.apportioned);
    expect(j.share.applied).toEqual({ land: splitOf(r).land.transferPrice, building: splitOf(r).building.transferPrice });
    expect(taxOf(r)).toBe(taxOf(await single(own(n, d), APPORTIONED)));
  });

  it("단독 소유는 지분 행 없이 종전 그대로", async () => {
    expect(splitOf(await single({})).saleSplitJudgment.share).toBeUndefined();
  });

  it("한쪽만 기재(토지) — 계약 총액으로 건물을 정해 판정", async () => {
    const j = splitOf(await single(own("1", "3"), { buildingTransferPrice: "" })).saleSplitJudgment;
    expect(j.declared).toEqual({ land: 850_000_000, building: 650_000_000 });
    expect(j.deemedUnclear).toBe(true);
  });
});

describe("Q-4 — 구분 기재 지분 몫의 합 = 지분 양도가액(종전 1원 모자람)", () => {
  it.each([["1", "3"], ["2", "3"], ["1", "7"]])("지분 %s/%s · 구분 기재 적용", async (n, d) => {
    const r = await single(own(n, d), FORCE_DECLARED);
    const s = splitOf(r);
    const ratio = Number(n) / Number(d);
    expect(s.land.transferPrice).toBe(applyRatio(850_000_000, ratio));
    expect(s.land.transferPrice + s.building.transferPrice).toBe(applyRatio(T, ratio));
  });
});

describe("함께 양도 · 지분 분할(축 B)", () => {
  const LAND: Partial<AssetForm> = {
    assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300",
    acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000",
    standardPriceAtTransfer: "150000000", actualSalePrice: "300000000",
  };
  it("주택 1/3 지분 + 토지 — 계약서로 판정 · 세액 = 안분 모드", async () => {
    // 함께 양도 실가 모드 총액 = 자산별 양도가액 합 — 지분 주택은 지분 몫(5억)으로 더한다(⑧).
    const bundle = (...over: Partial<AssetForm>[]) => form(800_000_000, [asset(1, HOUSE, own("1", "3"), ...over), asset(2, LAND)], {
      assetSplitMode: "companion", bundledSaleMode: "actual", ...(MULTI as object),
    } as never);
    const r = await run(bundle());
    expect(r.status).toBe(200);
    const j = splitOf(r).saleSplitJudgment;
    expect(j.deemedUnclear).toBe(true);
    expect(j.share).toBeDefined();
    expect(taxOf(r)).toBe(taxOf(await run(bundle(APPORTIONED))));
  });

  it("1/3 + 2/3 — 같은 계약서의 지분은 결론이 하나 · 세액 = 안분 모드", async () => {
    const shares = (...over: Partial<AssetForm>[]) => form(T, [
      asset(1, HOUSE, own("1", "3"), ...over),
      asset(2, HOUSE, own("2", "3"), { acquisitionDate: "2024-06-01" }, ...over),
    ], MULTI);
    const r = await run(shares());
    expect(r.status).toBe(200);
    expect([0, 1].map((i) => splitOf(r, i).saleSplitJudgment.deemedUnclear)).toEqual([true, true]);
    expect(splitOf(r, 1).saleSplitJudgment.declared).toEqual({ land: 850_000_000, building: 650_000_000 });
    expect(taxOf(r)).toBe(taxOf(await run(shares(APPORTIONED))));
  });
});

describe("다건 계산(/multi) — 같은 판정", () => {
  const multi = async (...over: Partial<AssetForm>[]) => {
    const payload = JSON.parse(JSON.stringify(buildPropertyPayload(form(T, [asset(1, HOUSE, own("1", "3"), ...over)], MULTI) as never)));
    const res = await POST_MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "p1", ...payload }], annualBasicDeductionUsed: 0 }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (await res.json()) as any };
  };
  it("1/3 지분 · 정확히 +30% → 「불분명」 · 세액 = 안분 모드", async () => {
    const r = await multi();
    expect(r.status, JSON.stringify(r.json.error ?? null)).toBe(200);
    const sd = r.json.data.properties[0].splitDetail;
    expect(sd.saleSplitJudgment.deemedUnclear).toBe(true);
    expect(sd.saleSplitJudgment.declared).toEqual({ land: 850_000_000, building: 650_000_000 });
    expect(r.json.data.determinedTax).toBe((await multi(APPORTIONED)).json.data.determinedTax);
  });
});

describe("resolveTransferPriceSplit — 30% 경계(±) 탐색: 지분 판정 = 100% 판정", () => {
  // 홀수 기준시가 — 종전 지분 몫 판정이 몇 원 폭으로 100%와 갈리던 시료(서브에이전트 실측 2026-10-23).
  const STD = { landStandardPriceAtTransfer: 1_000_000_000, buildingStandardPriceAtTransfer: 437_000_003 };
  const base = { transferDate: new Date("2026-02-16"), ...STD } as unknown as TransferTaxInput;
  const judge = (input: Partial<TransferTaxInput>) => resolveTransferPriceSplit({ ...base, ...input } as TransferTaxInput).judgment!;

  it("+30%·−30% 두 경계 · 지분 1/3·2/3·1/7·37/100", () => {
    const apportionedBuilding = judge({ transferPrice: T, landTransferPrice: T - 1 }).apportioned!.building;
    let diverged = 0;
    for (const edge of [Math.floor((apportionedBuilding * 13) / 10), Math.floor((apportionedBuilding * 7) / 10)])
    for (const r of [1 / 3, 2 / 3, 1 / 7, 37 / 100]) {
      for (let b = edge - 15; b <= edge + 15; b++) {
        const land = T - b;
        const full = judge({ transferPrice: T, landTransferPrice: land, buildingTransferPrice: b });
        // ④가 만드는 지분 와이어 — 토지만 지분 몫(Q-4) + 계약서 금액(100%)
        const share = { transferPrice: applyRatio(T, r), landTransferPrice: applyRatio(land, r), ownershipRatio: r, totalPropertyTransferPrice: T };
        const legacy = judge({ ...share, ownershipRatio: undefined });
        const now = judge({ ...share, contractLandTransferPrice: land, contractBuildingTransferPrice: b });
        expect(now.deemedUnclear, `r=${r} b=${b}`).toBe(full.deemedUnclear);
        expect(now.declared).toEqual(full.declared);
        if (legacy.deemedUnclear !== full.deemedUnclear) diverged++;
      }
    }
    // 종전 결함이 이 구간에 실제로 있어야 의미가 있다.
    expect(diverged).toBeGreaterThan(0);
  });
});
