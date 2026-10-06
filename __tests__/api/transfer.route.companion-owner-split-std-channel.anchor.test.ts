/**
 * anchor: 함께양도 **컴패니언 자산의 취득시 기준시가 채널**(소득령 §166⑥·소득법 §99①1호 가목) — 2026-10-07
 *
 * ## 결함 — 「⑤·⑧은 받는데 ④·⑫·⑭가 나르지 않는다」
 *
 * 컴패니언 카드도 「토지·건물 소유자 다름」·「토지·건물 취득일 다름」을 렌더하고(`CompanionAcquisitionCauseSection`),
 * ⑧(`validateSplitDirectInputs` V8)은 취득 당시 ㎡당 개별공시지가·면적·기준시가 총액을 **필수**로 받는다.
 * 그런데 ④ `buildAssetPayload`는 ㎡당 공시지가·면적을 싣지 않고 총액도 환산·감정일 때만 실었다. ⑫ 컴패니언 스키마엔
 * ㎡당 공시지가 칸이 없고, ⑭는 `acquisitionArea`를 ④가 보내지 않는 `areaM2`에서만 읽었다.
 *
 * ⇒ 엔진 `calcAcqStdPair`가 토지분을 못 만들어 `calcSplitGain`이 null → **`selfOwns`가 통째로 무시**된다.
 *   실측(종전): 일반건물·주택 모두 `both`·`building_only`·`land_only`의 결정세액이 174,270,000으로 **같았다**
 *   — 비소유 파트까지 과세(침묵 오답). 별개 취득 + 토지 환산은 입력한 공시지가가 버려져 400(경로 없음).
 *
 * 기대값은 같은 물건을 **주 자산(단건)으로** 계산한 분리 내역과 대조했다(COS-06).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

/** 주 자산 = 토지(양도 6억 · 안분 키 4억). 컴패니언 안분 키도 4억이라 컴패니언 양도가액 = 10억 × ½ = 5억. */
const BASE = {
  propertyType: "land" as const,
  transferDate: "2024-03-01",
  transferPrice: 600_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionPrice: 200_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  standardPriceAtTransferForApportion: 400_000_000,
  totalSalePrice: 1_000_000_000,
};

type Kind = "building" | "housing";
type Owns = AssetForm["selfOwns"];

/**
 * 컴패니언 폼 — 2015-01-01 매매 1.5억(동시 취득). 취득시 토지분 = 1,000,000 × 100㎡ = 1억, 나목 5천만, 결합 총액 1.6억.
 * 양도시 토지분 2.5억 · 건물분 1.5억(양도가액 5억을 312,500,000 : 187,500,000으로 안분).
 */
function asset(kind: Kind, selfOwns: Owns, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(2),
    assetId: "c1",
    assetKind: kind,
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "150000000",
    selfOwns,
    hasSeperateLandAcquisitionDate: selfOwns !== "both",
    landAcquisitionDate: "2015-01-01",
    acquisitionArea: "100",
    transferArea: "100",
    standardPricePerSqmAtAcq: "1000000",
    buildingStandardPriceAtAcq: "50000000",
    standardPriceAtAcq: "160000000",
    standardPriceAtTransfer: "400000000",
    landStandardPriceAtTransfer: "250000000",
    buildingStandardPriceAtTransfer: "150000000",
    ...over,
  } as AssetForm;
}

interface Part { transferPrice: number; acquisitionPrice: number; gain: number }
interface Card {
  propertyId: string;
  transferGain: number;
  splitDetail?: { land: Part; building: Part } | null;
}
interface Agg { determinedTax: number; properties: Card[] }

async function postCompanion(a: AssetForm): Promise<{ status: number; agg?: Agg; error?: unknown }> {
  const payload = buildAssetPayload(a, "apportioned", "2024-03-01");
  const res = await POST(req({ ...BASE, companionAssets: [payload] }));
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  return { status: res.status, agg: json.data?.aggregated, error: json.error };
}
const card = (agg: Agg) => agg.properties.find((p) => p.propertyId === "c1")!;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("컴패니언 소유자 분리 — 취득시 기준시가 채널", () => {
  it("COS-01: 🔴 일반건물 건물만 소유 — 건물 파트 양도차익만 과세된다 (종전 전체 350,000,000)", async () => {
    const both = await postCompanion(asset("building", "both"));
    const own = await postCompanion(asset("building", "building_only"));
    expect(own.status, JSON.stringify(own.error)).toBe(200);
    const c = card(own.agg!);
    expect(c.splitDetail, "분리 계산이 성립해야 한다").toBeTruthy();
    // 일반건물 비-별개: 토지분 1억, 건물분 = 총액 1.6억 − 1억 = 6천만(일반건물 한시 후퇴) → 취득가 비율 0.625
    expect(c.splitDetail!.building.transferPrice).toBe(187_500_000);
    expect(c.splitDetail!.building.acquisitionPrice).toBe(56_250_000);
    expect(c.transferGain).toBe(131_250_000);
    expect(own.agg!.determinedTax).toBeLessThan(both.agg!.determinedTax);
  });

  it("COS-02: 🔴 일반건물 토지만 소유 — 토지 파트 양도차익만 과세된다", async () => {
    const own = await postCompanion(asset("building", "land_only"));
    expect(own.status, JSON.stringify(own.error)).toBe(200);
    const c = card(own.agg!);
    expect(c.splitDetail!.land.transferPrice).toBe(312_500_000);
    expect(c.splitDetail!.land.acquisitionPrice).toBe(93_750_000);
    expect(c.transferGain).toBe(218_750_000);
  });

  it("COS-03: 🔴 주택 건물만 소유 — 개별주택가격 비례 안분(가목:나목)으로 나눈다 (S3-1과 같은 산식)", async () => {
    const own = await postCompanion(asset("housing", "building_only"));
    expect(own.status, JSON.stringify(own.error)).toBe(200);
    const c = card(own.agg!);
    expect(c.splitDetail).toBeTruthy();
    // 토지분 = floor(1.6억 × 1억 ÷ 1.5억) = 106,666,666 → 취득가 토지 99,999,999 · 건물 50,000,001(잔액 흡수)
    expect(c.splitDetail!.building.transferPrice).toBe(187_500_000);
    expect(c.splitDetail!.building.acquisitionPrice).toBe(50_000_001);
    expect(c.transferGain).toBe(137_499_999);
  });

  it("COS-04: 🔴 별개 취득 + 토지 환산 — 입력한 공시지가가 엔진에 닿는다 (종전 400)", async () => {
    const r = await postCompanion(
      asset("building", "both", {
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2005-01-01",
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "50000000",
      } as Partial<AssetForm>),
    );
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(card(r.agg!).splitDetail).toBeTruthy();
  });

  it("COS-06: 주 자산(단건)으로 같은 물건을 계산한 분리 내역과 1원까지 같다 — 단건↔컴패니언 dual-truth 없음", async () => {
    const primaryBody = (kind: Kind, so: Owns) => ({
      ...BASE,
      propertyType: kind,
      transferPrice: 500_000_000,
      acquisitionDate: "2015-01-01",
      acquisitionPrice: 150_000_000,
      householdHousingCount: 2,
      standardPriceAtTransferForApportion: undefined,
      totalSalePrice: undefined,
      selfOwns: so,
      landAcquisitionDate: "2015-01-01",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      saleSplitMode: "apportioned",
      isSeparateAcquisition: false,
      standardPricePerSqmAtAcquisition: 1_000_000,
      acquisitionArea: 100,
      standardPriceAtAcquisition: 160_000_000,
      buildingStandardPriceAtAcquisition: 50_000_000,
      landStandardPriceAtTransfer: 250_000_000,
      buildingStandardPriceAtTransfer: 150_000_000,
      standardPriceAtTransfer: 400_000_000,
    });
    for (const kind of ["building", "housing"] as const) {
      for (const so of ["building_only", "land_only"] as const) {
        const res = await POST(req(primaryBody(kind, so)));
        type Single = { transferGain: number; splitDetail: { land: Part; building: Part } };
        const json = (await res.json()) as { data?: { result?: Single } };
        expect(res.status).toBe(200);
        const single = json.data!.result!;
        const comp = card((await postCompanion(asset(kind, so))).agg!);
        expect(comp.transferGain, `${kind}:${so}`).toBe(single.transferGain);
        expect(comp.splitDetail!.land.acquisitionPrice).toBe(single.splitDetail.land.acquisitionPrice);
        expect(comp.splitDetail!.building.acquisitionPrice).toBe(single.splitDetail.building.acquisitionPrice);
      }
    }
  });

  it("COS-05: 분리 축이 꺼진 컴패니언은 면적·㎡당 공시지가를 싣지 않는다 — 토지 컴패니언 세율 판정(면적) 불변", () => {
    const land = buildAssetPayload(
      { ...asset("building", "both"), assetKind: "land", hasSeperateLandAcquisitionDate: false } as AssetForm,
      "apportioned",
      "2024-03-01",
    ) as Record<string, unknown>;
    expect(land.acquisitionArea).toBeUndefined();
    expect(land.standardPricePerSqmAtAcquisition).toBeUndefined();
    // 소유자 분리 컴패니언은 싣는다(④ 채널)
    const own = buildAssetPayload(asset("building", "building_only"), "apportioned", "2024-03-01") as Record<string, unknown>;
    expect(own.standardPricePerSqmAtAcquisition).toBe(1_000_000);
    expect(own.acquisitionArea).toBe(100);
    expect(own.standardPriceAtAcquisition).toBe(160_000_000);
  });
});
