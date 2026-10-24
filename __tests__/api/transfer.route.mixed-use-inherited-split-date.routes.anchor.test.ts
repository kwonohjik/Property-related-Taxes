/**
 * 겸용주택 상속·증여 × 토지·건물 취득일 중 한쪽만 의제취득일(1985.1.1.) 전 — 일반 양도도 명시 차단(사용자 결정 2026-10-24 · PR-7b-7b 리뷰 F-1 후속).
 * 종전에는 건물 취득일 하나로 자산 전체 비교 구간을 정해 조용히 틀렸다(⑧·⑫ 통과 200). 시료는 PR-6 anchor(`transfer.route.mixed-use-sec163-9-compare.routes.anchor.test.ts`)와 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { refineMixedUseInheritedSplitDate } from "@/lib/api/transfer-tax-schema-mixed-bg-refines";
import { assertMixedInheritedSplitDateSupported } from "@/lib/tax-engine/mixed-use-inherited-split-date";
import { isMixedInheritedSplitDateStraddle } from "@/lib/tax-engine/mixed-use-inherited-split-date";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const T = 3_000_000_000;
const MIX = {
  assetKind: "housing",
  isMixedUseHouse: true,
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-03-01",
  inheritanceStartDate: "1980-03-01",
  decedentAcquisitionDate: "1970-01-01",
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  buildingFootprintArea: "100",
  mixedUseTotalLandArea: "200",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferHousingBuildingStdPrice: "800000000",
  mixedTransferLandPricePerSqm: "12000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "400000000",
  mixedAcqHousingBuildingStdPrice: "380000000",
  mixedAcqCommercialBuildingPrice: "80000000",
  mixedAcqLandPricePerSqm: "1200000",
  actualSalePrice: String(T),
} as Partial<AssetForm>;
const PHD = {
  usePreHousingDisclosure: true,
  useEstimatedAcquisition: true,
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "600000000",
  phdLandPricePerSqmAtAcq: "1200000",
  phdBuildingStdPriceAtAcq: "300000000",
  phdLandPricePerSqmAtFirst: "4000000",
  phdBuildingStdPriceAtFirst: "350000000",
  phdLandPricePerSqmAtTransfer: "12000000",
  phdBuildingStdPriceAtTransfer: "800000000",
  phdTransferHousingPrice: "1600000000",
  mixedAcqHousingPrice: "",
  mixedAcqHousingBuildingStdPrice: "",
} as Partial<AssetForm>;
const GIFT = { acquisitionCause: "gift", inheritanceStartDate: "", decedentAcquisitionDate: "", donorAcquisitionDate: "1970-01-01" } as Partial<AssetForm>;
const inh = (h: string, c: string) => ({ mixedHousingInheritedValueOverride: h, mixedCommercialInheritedValueOverride: c }) as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, MIX, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-08-20";
  f.filingDate = "2024-10-31";
  f.contractTotalPrice = String(T);
  f.householdHousingCount = "2";
  f.isOneHousehold = false;
  f.assets = [a];
  return f;
}
async function run(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  const issues = [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message);
  return { status: res.status, json, body, issues };
}

const SPLIT = (land: string, building: string) =>
  ({ acquisitionDate: building, inheritanceStartDate: building, landAcquisitionDate: land, hasSeperateLandAcquisitionDate: true }) as Partial<AssetForm>;
const MSG = /토지·건물 취득일 중 한쪽만 1985\.1\.1\. 전이면 의제취득일 전후가 섞여 계산하지 않습니다/;

describe("일반 양도 겸용 — 토지·건물 취득일 중 한쪽만 1985.1.1. 전이면 ⑫가 막는다(화면에서는 생기지 않는 상태 — API 직접·숨은 칸 잔재)", () => {
  // 겸용 상속·증여에는 토지 취득일 칸이 없다 — 이 폼 상태(분리 ON + 토지 날짜)는 원인 전환·복원이 비우므로 화면에서 만들 수 없다.
  // ④는 그대로 보내고 ⑫가 400으로 막는다. 종전에는 ⑫도 통과해 건물 날짜로 자산 전체 구간을 정했다(조용한 오답).
  it("[S-1] 상속 · 토지 1983 · 건물 1990 → ⑫ 400 (종전 200 · 건물 날짜로 단서 구간 — 토지의 ③ 누락 709,095,000)", async () => {
    const r = await run(form(asset(PHD, SPLIT("1983-03-01", "1990-03-01"), inh("100000000", "100000000"))));
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors["mixedUse.landAcquisitionDate"][0]).toMatch(MSG);
  });

  it("[S-2] 상속 · 토지 1990 · 건물 1983 → 400 (종전 200 · 자산 전체 의제취득일 전 — 1990 토지에도 ③ 698,207,732)", async () => {
    const r = await run(form(asset(PHD, SPLIT("1990-03-01", "1983-03-01"), inh("100000000", "100000000"))));
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors["mixedUse.landAcquisitionDate"][0]).toMatch(MSG);
  });

  it("[S-3] 증여 · 토지 1983 · 건물 1990 → 400", async () => {
    const r = await run(form(asset(PHD, GIFT, SPLIT("1983-03-01", "1990-03-01"), { mixedHousingGiftValueOverride: "100000000", mixedCommercialGiftValueOverride: "100000000" } as Partial<AssetForm>)));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error.fieldErrors)).toMatch(MSG);
  });

  it("🔴 짝: 토지·건물 모두 1983 → 200 의제취득일 전 비교 / 모두 1990 → 200 단서 구간 비교", async () => {
    const a = await run(form(asset(PHD, SPLIT("1983-03-01", "1983-03-01"), inh("100000000", "100000000"))));
    expect(a.issues.join()).not.toMatch(MSG);
    expect(a.status).toBe(200);
    expect(a.json.data.result.sec163_9Comparison.era).toBe("pre_deemed");
    const b = await run(form(asset(PHD, SPLIT("1990-01-01", "1990-03-01"), inh("100000000", "100000000"))));
    expect(b.status).toBe(200);
    expect(b.json.data.result.sec163_9Comparison.era).toBe("clause");
  });

  it("🔴 짝: 매매 겸용은 이 규칙을 쓰지 않는다(취득원인 판정)", () => {
    expect(isMixedInheritedSplitDateStraddle("purchase", "1983-03-01", "1990-03-01")).toBe(false);
    expect(isMixedInheritedSplitDateStraddle("inheritance", "1983-03-01", "1990-03-01")).toBe(true);
    expect(isMixedInheritedSplitDateStraddle("gift", "1990-03-01", "1983-03-01")).toBe(true);
    expect(isMixedInheritedSplitDateStraddle("inheritance", "1984-12-31", "1985-01-01")).toBe(true);
    expect(isMixedInheritedSplitDateStraddle("inheritance", "1985-01-01", "1990-03-01")).toBe(false);
  });
});

describe("⑫ 함께 양도 겸용 · 엔진 가드", () => {
  const issues = (data: Parameters<typeof refineMixedUseInheritedSplitDate>[0]) => {
    const out: { path: (string | number)[] }[] = [];
    refineMixedUseInheritedSplitDate(data, { addIssue: (i: { path: (string | number)[] }) => out.push(i) } as never);
    return out.map((i) => i.path.join("."));
  };

  it("컴패니언 겸용 상속 · 토지 1983 · 건물 1990 → companionAssets.0.mixedUse.landAcquisitionDate / 🔴 짝: 같은 날이면 없음", () => {
    expect(issues({ companionAssets: [{ assetKind: "mixed_use_house", acquisitionCause: "inheritance", mixedUse: { landAcquisitionDate: "1983-03-01", buildingAcquisitionDate: "1990-03-01" } }] }))
      .toEqual(["companionAssets.0.mixedUse.landAcquisitionDate"]);
    expect(issues({ companionAssets: [{ assetKind: "mixed_use_house", acquisitionCause: "inheritance", mixedUse: { landAcquisitionDate: "1990-03-01", buildingAcquisitionDate: "1990-03-01" } }] }))
      .toEqual([]);
  });

  it("주 자산 부담부증여는 이 refine이 아니라 collector(MB-16)가 막는다", () => {
    expect(issues({ propertyType: "mixed-use-house", transferType: "burdened_gift", acquisitionCause: "inheritance", mixedUse: { landAcquisitionDate: "1983-03-01", buildingAcquisitionDate: "1990-03-01" } })).toEqual([]);
    expect(issues({ propertyType: "mixed-use-house", transferType: "regular", acquisitionCause: "inheritance", mixedUse: { landAcquisitionDate: "1983-03-01", buildingAcquisitionDate: "1990-03-01" } })).toEqual(["mixedUse.landAcquisitionDate"]);
  });

  it("단건 엔진 진입(calcMixedUseTransferTax) — ⑫를 거치지 않는 호출도 막는다(컴패니언 겸용은 엔진 입력에 취득원인이 없어 ⑫가 방어선) / 🔴 짝: 매매는 계산한다", () => {
    const base = mixedUseCase14();
    const split = { landAcquisitionDate: new Date("1983-03-01"), buildingAcquisitionDate: new Date("1990-03-01") };
    expect(() => calcMixedUseTransferTax(2_300_000_000, new Date("2024-08-20"), { ...base, ...split, acquisitionCause: "inheritance" }, makeMockRatesWithHouseEngine())).toThrow(MSG);
    expect(() => calcMixedUseTransferTax(2_300_000_000, new Date("2024-08-20"), { ...base, ...split, acquisitionCause: "purchase" }, makeMockRatesWithHouseEngine())).not.toThrow(MSG);
  });

  it("엔진 가드 — Date 입력도 같은 판정으로 던진다", () => {
    expect(() => assertMixedInheritedSplitDateSupported({ acquisitionCause: "inheritance", landAcquisitionDate: new Date("1983-03-01"), buildingAcquisitionDate: new Date("1990-03-01") })).toThrow(MSG);
    expect(() => assertMixedInheritedSplitDateSupported({ acquisitionCause: "inheritance", landAcquisitionDate: new Date("1983-03-01"), buildingAcquisitionDate: new Date("1983-03-01") })).not.toThrow();
  });
});
