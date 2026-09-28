/**
 * E-14d route anchor — 겸용주택 × 「소득세법 시행령」 §155②③ 상속주택 주택 수 제외가 **폼 → ④ → ⑫ Zod → ⑭ route →
 * 겸용 엔진**까지 도달한다(`feedback_leaf_anchor_skips_zod_layer`). 엔진 직접호출 anchor는
 * `__tests__/tax-engine/transfer/mixed-use-inheritance-exclusion-e14d.anchor.test.ts`.
 *
 * ④는 명부(`houses`)와 §155② 괄호 사실(증여 2년·증여일·상속개시 당시 권리)을 **자산 종류와 무관하게** 이미 보냈고
 * ⑫도 받았다. 겸용 route(`buildMixedUseAssetInput`)가 괄호 사실을 버리고, 엔진이 제외 자체를 하지 않았다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 주택 60㎡ > 상가 40㎡(§154③ 본문) · 2009 취득 · 전체 10억 양도(12억 이하). */
const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "300000000",
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "100",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "600000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "150000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqLandPricePerSqm: "1000000",
};

/** 단독상속주택 — 상속개시 2015-03-01 (비조정·5년 경과는 무관 — 비과세 축만 본다). */
const INH: HouseEntry = {
  id: "h2",
  region: "capital",
  acquisitionDate: "2015-03-01",
  officialPrice: "300000000",
  isInherited: true,
  inheritedDate: "2015-03-01",
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
const PLAIN: HouseEntry = { ...INH, isInherited: false, inheritedDate: undefined };

function form(other: HouseEntry, over: Partial<TransferFormData> = {}, assetOver: Record<string, unknown> = {}) {
  return {
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...MIXED, ...assetOver }],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1000000000",
    householdHousingCount: "2",
    isOneHousehold: true,
    residencePeriodMonths: "120",
    houses: [other],
    ...over,
  } as unknown as TransferFormData;
}

type MixedResult = {
  calculationRoute: { highValueRule: string };
  commercialPart: { deemedHouseBy154_3Main?: true };
  total: { transferTax: number; taxBase: number };
  warnings: string[];
};

async function run(f: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  const json = (await res.json()) as { data?: { mode?: string; result?: MixedResult } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data?.mode).toBe("mixed-use");
  return { body: captured, result: json.data!.result! };
}

describe("E-14d route — 겸용주택 §155②③", () => {
  it("E14D-R0 대조군 — 일반 2주택 → 비과세 배제", async () => {
    const { result } = await run(form(PLAIN));
    expect(result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(result.total.transferTax).toBeGreaterThan(0);
  });

  it("E14D-R1 단독상속주택 → 1주택 → 비과세 · §154③ 본문으로 상가분까지(전체 12억 이하)", async () => {
    const { result } = await run(form(INH));
    expect(result.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(result.commercialPart.deemedHouseBy154_3Main).toBe(true);
    expect(result.warnings.some((w) => w.includes("§155② 일반주택 양도"))).toBe(true);
  });

  it("E14D-R2 ⑭ 증여 사실 도달 — 소급 2년 내 피상속인 증여(2019) → ② 풀 배제", async () => {
    const f = form(INH, {
      generalHouseGiftedFromDecedentWithin2yr: true,
      generalHouseGiftDate: "2019-01-01",
    } as Partial<TransferFormData>);
    const { body, result } = await run(f);
    expect(body.generalHouseGiftDate).toBe("2019-01-01");
    expect(result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14D-R3 ⑭ 증여일 Date 변환 — 2017(부칙 제16조 전) 증여 → 제외 미적용 ⇒ 비과세", async () => {
    const f = form(INH, {
      generalHouseGiftedFromDecedentWithin2yr: true,
      generalHouseGiftDate: "2017-06-01",
    } as Partial<TransferFormData>);
    const { result } = await run(f);
    expect(result.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("E14D-R4 ⑭ 상속개시 당시 권리 — 상속개시 후(2016) 취득 겸용: 미선언 과세 / 입주권 신축 선언 비과세", async () => {
    const late = { acquisitionDate: "2016-01-01" };
    const none = await run(form(INH, { generalHouseRightAtInheritance: "none" } as Partial<TransferFormData>, late));
    expect(none.result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    const right = await run(
      form(INH, { generalHouseRightAtInheritance: "redevelopment_right" } as Partial<TransferFormData>, late),
    );
    expect(right.body.generalHouseRightAtInheritance).toBe("redevelopment_right");
    expect(right.result.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("E14D-R5 §155③ 공동상속 소수지분 → 비과세 / 최대지분자 → 과세", async () => {
    const minority = await run(form({ ...INH, isCoInherited: true, isLargestCoInheritedShareholder: false }));
    expect(minority.result.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    const largest = await run(form({ ...INH, isCoInherited: true, isLargestCoInheritedShareholder: true }));
    expect(largest.result.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });
});
