/**
 * 토지 세율 수동 지정(`manualHoldingPeriodOverride`) — 세율 축에만 쓰이고, 주택 먼저 / 토지 먼저 순서와 무관하다 (결정 (b), 2026-10-20).
 *
 * 법령: 소득세법 §104①2·3호 괄호의 «대통령령으로 정하는 토지» = 영 §167의5(세율 축). 1세대1주택 비과세·배율은 §89①3호·영 §154⑦(비과세 축).
 * 지정이 배율 분리·한도 공유·비과세 단위를 끈다는 명문은 없다. 지정은 **과세되는 부분의 세율**만 정한다.
 *
 * 두 가지를 못 박는다.
 *  1. 순서 대칭 — 주 자산 스키마(⑫)·route 매핑(⑭)이 키를 받아 토지 먼저(주 자산=토지)도 주택 먼저(컴패니언 토지)와 같은 세액을 낸다.
 *  2. 의미 — 배율 이내(300㎡)는 지정해도 비과세 유지, 배율 초과분(104-1-8)은 지정 세율을 받지 않고, 한도 내 몫만 지정 세율을 받는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { appurtenantLimitShareOf } from "@/app/api/calc/transfer/bundled-companion-split";
import { appurtenantLimitShareOfAssets } from "@/lib/calc/housing-excess-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TD = "2026-02-16";
const rates = loadFallbackTransferRates(new Date(TD));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

type Prop = {
  propertyId: string;
  isExempt?: boolean;
  isPartialExempt?: boolean;
  rateClause?: string;
  determinedTax?: number;
  appliedRate?: number;
};
type Agg = { totalTax: number; properties: Prop[] };

async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}

const COMMON = {
  transferDate: TD,
  acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
};
const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
type OV = "shortTermHousing70" | "shortTerm60" | "progressive" | undefined;
const OVS: OV[] = [undefined, "progressive", "shortTermHousing70", "shortTerm60"];

interface Facts {
  house: number;
  land: number;
  areaM2: number;
}
const SAMPLES: Record<"within300" | "excess100" | "highPlusExcess" | "highWithin300", Facts> = {
  highWithin300: { house: 1_100_000_000, land: 400_000_000, areaM2: 300 },
  within300: { house: 800_000_000, land: 300_000_000, areaM2: 300 },
  excess100: { house: 800_000_000, land: 300_000_000, areaM2: 400 },
  highPlusExcess: { house: 1_100_000_000, land: 400_000_000, areaM2: 400 },
};

/** 주택 먼저 — 주 자산 주택 + 컴패니언 토지(지정 입력 위치). */
const houseFirst = (f: Facts, ov: OV) => ({
  ...COMMON,
  ...ZONE,
  propertyType: "housing",
  transferPrice: f.house,
  acquisitionPrice: f.house / 2,
  totalSalePrice: f.house + f.land,
  standardPriceAtTransferForApportion: f.house / 1000,
  companionAssets: [
    {
      assetId: "c1",
      assetLabel: "부수토지",
      assetKind: "land",
      landNature: "appurtenant_to_housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2014-01-01",
      fixedAcquisitionPrice: f.land / 2,
      standardPriceAtTransfer: f.land / 1000,
      directExpenses: 0,
      isOneHousehold: true,
      areaM2: f.areaM2,
      reductions: [],
      ...(ov ? { manualHoldingPeriodOverride: ov } : {}),
    },
  ],
});

/** 토지 먼저 — 주 자산 토지(지정은 주 자산 스키마로) + 컴패니언 주택. */
const landFirst = (f: Facts, ov: OV) => ({
  ...COMMON,
  propertyType: "land",
  landNature: "appurtenant_to_housing",
  transferPrice: f.land,
  acquisitionPrice: f.land / 2,
  acquisitionArea: f.areaM2,
  transferArea: f.areaM2,
  totalSalePrice: f.house + f.land,
  standardPriceAtTransferForApportion: f.land / 1000,
  ...(ov ? { manualHoldingPeriodOverride: ov } : {}),
  companionAssets: [
    {
      assetId: "h1",
      assetLabel: "주택",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2014-01-01",
      fixedAcquisitionPrice: f.house / 2,
      standardPriceAtTransfer: f.house / 1000,
      directExpenses: 0,
      isOneHousehold: true,
      reductions: [],
      ...ZONE,
    },
  ],
});

/** 토지 몫 항목 — 주택 먼저는 `c1*`, 토지 먼저는 `primary*`. */
const landParts = (agg: Agg, id: "c1" | "primary") => agg.properties.filter((p) => p.propertyId.startsWith(id));
const part = (agg: Agg, id: "c1" | "primary", kind: "appurtenant" | "excess" | "whole") =>
  landParts(agg, id).find((p) => (kind === "whole" ? p.propertyId === id : p.propertyId === `${id}__${kind}`));

describe("지정 없음 기준선 — 순서 무관 (종전과 같다)", () => {
  it.each([
    ["within300", 0],
    ["excess100", 5_764_000],
    ["highPlusExcess", 14_652_000],
  ] as const)("%s → %i원", async (key, expected) => {
    const fw = await post(houseFirst(SAMPLES[key], undefined));
    const rv = await post(landFirst(SAMPLES[key], undefined));
    expect(fw.totalTax).toBe(expected);
    expect(rv.totalTax).toBe(expected);
  });
});

describe("배율 이내 300㎡ — 지정해도 비과세 유지 (결정 (b): 비과세 단위는 지정과 무관)", () => {
  it.each(OVS)("ov=%s → 주택 먼저·토지 먼저 모두 0원 · 전 항목 비과세", async (ov) => {
    for (const body of [houseFirst(SAMPLES.within300, ov), landFirst(SAMPLES.within300, ov)]) {
      const agg = await post(body);
      expect(agg.totalTax).toBe(0);
      expect(agg.properties.every((p) => p.isExempt === true)).toBe(true);
    }
  });
});

describe("배율 초과 100㎡ (주택 8억 + 토지 3억 400㎡) — 한도 내 몫은 비과세, 초과분은 지정과 무관하게 비사업용 토지(104-1-8)", () => {
  it.each(OVS)("ov=%s → 순서 무관 5,764,000원 · 초과분 104-1-8", async (ov) => {
    const fw = await post(houseFirst(SAMPLES.excess100, ov));
    const rv = await post(landFirst(SAMPLES.excess100, ov));
    expect(fw.totalTax).toBe(5_764_000);
    expect(rv.totalTax).toBe(5_764_000);
    expect(part(fw, "c1", "appurtenant")?.isExempt).toBe(true);
    expect(part(rv, "primary", "appurtenant")?.isExempt).toBe(true);
    expect(part(fw, "c1", "excess")?.rateClause).toBe("104-1-8");
    expect(part(rv, "primary", "excess")?.rateClause).toBe("104-1-8");
  });
});

describe("고가 + 초과 (주택 11억 + 토지 4억 400㎡) — 순서 무관 · 초과분(104-1-8)·주택은 지정과 무관", () => {
  // 한도 내 몫(300㎡)의 과세 양도차익이 0이라(기재부 재산세제과-915 방식 — 초과분 양도차익을 한 번 더 뺀다) 지정 세율이 세액에 닿지 않는다.
  // 지정 세율이 실제로 닿는 구성은 아래 «고가 + 배율 이내».
  it.each(OVS)("ov=%s → 14,652,000원", async (ov) => {
    const fw = await post(houseFirst(SAMPLES.highPlusExcess, ov));
    const rv = await post(landFirst(SAMPLES.highPlusExcess, ov));
    expect(fw.totalTax).toBe(14_652_000);
    expect(rv.totalTax).toBe(14_652_000);
    expect(part(fw, "c1", "excess")?.determinedTax).toBe(8_240_000);
    expect(part(rv, "primary", "excess")?.determinedTax).toBe(8_240_000);
    expect(part(fw, "c1", "excess")?.rateClause).toBe("104-1-8");
    expect(part(rv, "primary", "excess")?.rateClause).toBe("104-1-8");
    expect(fw.properties.find((p) => p.propertyId === "primary")?.determinedTax).toBe(5_340_000);
    expect(rv.properties.find((p) => p.propertyId === "h1")?.determinedTax).toBe(5_340_000);
  });
});

describe("고가 + 배율 이내 (주택 11억 + 토지 4억 300㎡) — 과세되는 부수토지 몫에 지정 세율이 실린다 · 순서 무관", () => {
  // 부수토지 몫의 과세표준 16,000,000원: 누진 16,000,000×15%−1,260,000 = 1,140,000 / 70% = 11,200,000 / 60% = 9,600,000. 주택 카드는 5,340,000 그대로.
  const EXPECTED: Record<string, { total: number; landTax: number; landRate: number }> = {
    none: { total: 8_844_000, landTax: 1_140_000, landRate: 0.15 },
    progressive: { total: 8_844_000, landTax: 1_140_000, landRate: 0.15 },
    shortTermHousing70: { total: 16_269_000, landTax: 11_200_000, landRate: 0.7 },
    shortTerm60: { total: 14_784_000, landTax: 9_600_000, landRate: 0.6 },
  };
  it.each(OVS)("ov=%s", async (ov) => {
    const e = EXPECTED[ov ?? "none"];
    const fw = await post(houseFirst(SAMPLES.highWithin300, ov));
    const rv = await post(landFirst(SAMPLES.highWithin300, ov));
    expect(fw.totalTax).toBe(e.total);
    expect(rv.totalTax).toBe(e.total);
    // 비과세 단위는 그대로 — 두 카드 모두 고가주택 부분과세(PX)
    expect(part(fw, "c1", "whole")).toMatchObject({ isPartialExempt: true, determinedTax: e.landTax, appliedRate: e.landRate });
    expect(part(rv, "primary", "whole")).toMatchObject({ isPartialExempt: true, determinedTax: e.landTax, appliedRate: e.landRate });
    expect(fw.properties.find((p) => p.propertyId === "primary")?.determinedTax).toBe(5_340_000);
    expect(rv.properties.find((p) => p.propertyId === "h1")?.determinedTax).toBe(5_340_000);
  });
});

describe("화면(④⑤)·엔진 한도 공유 면적 — 지정 여부와 무관", () => {
  it("엔진 appurtenantLimitShareOf — 지정 카드도 합계에 든다", () => {
    const cs = [
      { assetKind: "land", landNature: "appurtenant_to_housing" as const, areaM2: 100 },
      { assetKind: "land", landNature: "appurtenant_to_housing" as const, areaM2: 50, manualHoldingPeriodOverride: "progressive" as const },
    ];
    expect(appurtenantLimitShareOf({ propertyType: "housing", acquisitionArea: 500 }, cs).appurtenantCardsAreaM2).toBe(150);
  });
  it("화면 appurtenantLimitShareOfAssets — 지정 카드도 합계에 든다 (엔진과 같은 기준)", () => {
    const primary = { ...makeDefaultAsset(), assetKind: "housing" as const };
    const card = (override: "progressive" | undefined) => ({
      ...makeDefaultAsset(),
      assetKind: "land" as const,
      landNature: "appurtenant" as const,
      acquisitionArea: "100",
      transferArea: "100",
      manualHoldingPeriodOverride: override,
    });
    expect(appurtenantLimitShareOfAssets(primary, [card(undefined), card("progressive")]).appurtenantCardsAreaM2).toBe(200);
  });
});

describe("함께 양도 자산이 없는 단독 토지 — 지정을 읽지 않는다 (종전과 같다 · 다건 ⑫ 무효과 목록 근거)", () => {
  const single = async (o: OV) => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...COMMON,
          propertyType: "land",
          landNature: "non_appurtenant",
          transferPrice: 300_000_000,
          acquisitionPrice: 150_000_000,
          ...(o ? { manualHoldingPeriodOverride: o } : {}),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { result: { totalTax: number } } };
    expect(j.data.result.totalTax).toBeGreaterThan(0); // 변별력 — 0이면 두 값이 같아도 의미 없다
    return j.data.result.totalTax;
  };
  it.each(OVS)("ov=%s → 지정 없음과 같은 세액", async (ov) => {
    expect(await single(ov)).toBe(await single(undefined));
  });
});
