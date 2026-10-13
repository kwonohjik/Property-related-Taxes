/**
 * #16 (G8-3) 겸용주택 route — 상속주택 제외로 1주택이 된 세대의 §155⑧ 의제가 겸용 서브엔진의 중과 배제(영 §167의10①15호)에도
 * 단건과 같은 술어로 닿는다. 겸용 서브엔진은 `culturalOrUnavoidableDeemingBasis`를 단건과 공유한다.
 *
 * | 시료(겸용 · 양도 2026-09-18 · 조정 · 세대 3주택) | 수정 전 | 수정 후 |
 * |---|---|---|
 * | ⑧ 주택(기준시가 3억 이하 · 중과 주택 수 밖) + 상속(2019) + 겸용 양도 | multi_house_2 중과 | 배제(15호) + 2중첩 고지 |
 * | 대조: 일반주택 + 상속(2019) + 겸용 양도(⑧ 선언 없음) | multi_house_3plus | 불변 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

/** 주택 60㎡ > 상가 40㎡(§154③ 본문) · 2009 취득 · 전체 10억 양도 */
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000",
  residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "100",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "600000000", mixedTransferCommercialBuildingPrice: "100000000", mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "150000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "1000000",
};
const base = {
  id: "h", region: "capital" as const, acquisitionDate: "2018-01-01", officialPrice: "300000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
};
/** §155⑧ 수도권 밖 부득이 주택(근무상 형편 · 해소일 입력) */
const UNAV: HouseEntry = {
  ...base, id: "hu", region: "non_capital", oneHouseUnavoidableOutsideCapital: true,
  unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2025-06-01",
} as HouseEntry;
/** §155② 상속주택 — 2019 상속(5년 경과 → 중과 주택 수에 산입) */
const INH: HouseEntry = { ...base, id: "hi", acquisitionDate: "2019-06-01", isInherited: true, inheritedDate: "2019-06-01", decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true };

function form(houses: HouseEntry[]) {
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...MIXED }],
    transferDate: "2026-09-18", filingDate: "2026-10-31", contractTotalPrice: "1000000000",
    householdHousingCount: String(houses.length + 1), isOneHousehold: true, isRegulatedArea: true,
    residencePeriodMonths: "120", houses,
  } as unknown as TransferFormData);
}

type MultiHouse = { surchargeType: string; effectiveHouseCount: number; exclusionReasons: { type: string }[]; warnings: string[] };
async function run(f: TransferFormData): Promise<MultiHouse> {
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
  const json = (await res.json()) as { data?: { mode?: string; result?: { multiHouseSurcharge?: MultiHouse } } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data?.mode).toBe("mixed-use");
  return json.data!.result!.multiHouseSurcharge!;
}

describe("#16 겸용주택 × ⑧ + 상속 제외", () => {
  it("MU16-1 ⑧(중과 주택 수 밖) + 상속(2019) 3주택 → 15호 배제 · 2중첩 고지 (수정 전 multi_house_2)", async () => {
    const mh = await run(form([UNAV, INH]));
    expect(mh.surchargeType).toBe("none");
    expect(mh.exclusionReasons.map((x) => x.type)).toEqual(["unavoidable_outside_capital_house"]);
    expect(mh.warnings.some((w) => w.includes("2중첩") && w.includes("확인이 필요합니다"))).toBe(true);
  });

  it("MU16-2 대조 — ⑧ 선언이 없는 일반주택 + 상속(2019) 3주택은 종전대로 3주택 중과", async () => {
    const mh = await run(form([{ ...base, id: "hz" }, INH]));
    expect(mh.surchargeType).toBe("multi_house_3plus");
    expect(mh.exclusionReasons).toEqual([]);
    expect(mh.warnings.some((w) => w.includes("2중첩"))).toBe(false);
  });
});
