/**
 * 화면 경로(폼 → ④ → route) — 토지만 본인 주택의 D-1 다른 세대 중과 배제 · D-2 배율 초과분 비사업용 분리.
 * 계획서 `docs/02-design/features/land-only-surcharge-and-excess-split.plan.md` Q-1·Q-2 (a).
 *
 * 시료(독립 정수 산식 — 엔진 출력 복사 아님): 매매 3억 · 양도 12억 · 기준시가 토지 40% → 토지 양도가액 480,000,000 − 취득가액 120,000,000 = 360,000,000
 *   2015-01-01 취득 → 2023-02-16 양도(보유 8년 · 표1 16%) · 토지 100㎡ · 정착면적 20㎡ · 수도권 주거지역 3배 → 한도 60㎡ · 초과 40㎡(40%)
 *   초과분 = 360,000,000 × 40% = 144,000,000 → 장특 23,040,000 → 120,960,000 − 기본공제 2,500,000 = 118,460,000
 *   × 35% − 15,440,000 = 26,021,000 + 10%p 11,846,000 = 37,867,000
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const ONE_HOUSE = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const PUR: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  actualSalePrice: "1,200,000,000", fixedAcquisitionPrice: "300,000,000", residenceInputMode: "direct", residencePeriods: [], ...STD,
};
const EXCESS = { buildingFootprintArea: "20", appurtenantLandZone: "metropolitan_residential" };

const form = (a: Loose, hh: Loose = ONE_HOUSE): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...hh, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Loose, hh: Loose = ONE_HOUSE) {
  const f = form(a, hh);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: result?.calculatedTax as number | undefined,
    isExempt: result?.isExempt as boolean | undefined,
    excessGain: result?.splitDetail?.nonBusinessLandPart?.gain as number | undefined,
    warnings: (result?.warnings ?? []) as string[],
    body,
  };
}

describe("D-2 화면 경로 — 토지만 본인 배율 초과분", () => {
  it("같은 세대 · 1세대1주택 — 이내분 비과세 · 초과분 144,000,000 비사업용(수정 전: 전액 비과세 0)", async () => {
    const r = await run({ ...PUR, ...EXCESS, selfOwns: "land_only", buildingOwnerSameHousehold: true });
    expect([r.fields, r.status, r.excessGain, r.tax]).toEqual([[], 200, 144_000_000, 37_867_000]);
    expect([r.body.appurtenantLandZone, r.body.buildingFootprintArea]).toEqual(["metropolitan_residential", 20]);
  });

  it("다른 세대 — 토지 전액 과세 · 2호(86,874,200) < 1호라 합산 누진 94,022,000(초과분 파트는 남는다)", async () => {
    const r = await run({ ...PUR, ...EXCESS, selfOwns: "land_only", buildingOwnerSameHousehold: false });
    expect([r.fields, r.status, r.excessGain, r.tax]).toEqual([[], 200, 144_000_000, 94_022_000]);
  });

  it("건물만 본인 — 초과분을 나누지 않는다(비과세 그대로)", async () => {
    const r = await run({ ...PUR, ...EXCESS, selfOwns: "building_only" });
    expect([r.fields, r.status, r.excessGain, r.isExempt]).toEqual([[], 200, undefined, true]);
  });
});

describe("⑧ V9 — 토지 면적이 정착면적 3배 초과면 소재지 구분을 요구한다", () => {
  const noZone = { buildingFootprintArea: "20" };
  it("토지만 본인 — 소재지 미선택이면 그 칸으로(수정 전: 통과해 초과분이 조용히 비과세)", async () => {
    const r = await run({ ...PUR, ...noZone, selfOwns: "land_only", buildingOwnerSameHousehold: true });
    expect(r.fields).toEqual(["appurtenantLandZone"]);
  });
  it("소유자 같음은 종전대로 요구 · 건물만 본인은 요구하지 않는다", async () => {
    const both = await run({ ...PUR, ...noZone, selfOwns: "both" });
    const bldg = await run({ ...PUR, ...noZone, selfOwns: "building_only" });
    expect(both.fields).toContain("appurtenantLandZone");
    expect(bldg.fields).not.toContain("appurtenantLandZone");
  });
  it("매매사례가액 취득도 — 그 분기는 분리 검증 전에 반환한다(소유자 같음은 #17 검사가 받고, 토지만 본인은 수정 전 통과)", async () => {
    const sc = { ...PUR, ...noZone, isSalesCaseAcquisition: true, similarSalesValue: "300,000,000", selfOwns: "land_only", buildingOwnerSameHousehold: true };
    const r = await run(sc);
    expect(r.fields).toEqual(["appurtenantLandZone"]);
    const answered = await run({ ...sc, appurtenantLandZone: "metropolitan_residential" });
    expect([answered.fields, answered.status]).toEqual([[], 200]);
  });
});

describe("D-1 화면 경로 — 다른 세대 토지 중과 배제", () => {
  // 2021-08-01 양도 · 조정대상지역 · 세대 2주택 · 2015-01-01 취득(보유 6년 → 표1 12%) · 토지 양도차익 360,000,000(초과분 없음)
  const TWO: Loose = {
    ...ONE_HOUSE, transferDate: "2021-08-01", filingDate: "2021-10-31", householdHousingCount: "2", isOneHousehold: false,
    isRegulatedArea: true, isRegulatedAreaTouched: true,
  };
  it("다른 세대 — 중과 없이 표1 · 고지", async () => {
    const r = await run({ ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: false }, TWO);
    // 2021년 양도 누진구간(3억 초과 40% · 누진공제 25,400,000)
    // 360,000,000 × 12% = 43,200,000 → 316,800,000 − 2,500,000 = 314,300,000 × 40% − 25,400,000 = 100,320,000
    expect([r.status, r.tax, r.warnings.includes(LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE)]).toEqual([200, 100_320_000, true]);
  });
  it("같은 세대 — 종전대로 중과(+20%p · 장특 0)", async () => {
    const r = await run({ ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: true }, TWO);
    // 357,500,000 × (40% + 20%) − 25,400,000 = 189,100,000
    expect([r.status, r.tax, r.warnings.includes(LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE)]).toEqual([200, 189_100_000, false]);
  });
});

describe("V-5 다건(⑭ multi route)·함께 양도 자산(컴패니언)도 초과분을 나눈다", () => {
  /** 다건 본문 — 8억 1세대1주택 · 토지만 본인 같은 세대 · 토지 1,000㎡ · 정착면적 100㎡ · 수도권 주거 3배(초과 70%) */
  const multiBody = {
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    properties: [
      {
        propertyId: "p1", propertyLabel: "p1", propertyType: "housing", transferPrice: 800_000_000, transferDate: "2024-03-01",
        acquisitionPrice: 300_000_000, acquisitionDate: "2003-01-15", expenses: 0, useEstimatedAcquisition: false,
        householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        isNonBusinessLand: false, isOneHousehold: true, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
        selfOwns: "land_only", buildingOwnerSameHousehold: true, landAcquisitionDate: "2003-01-15",
        standardPricePerSqmAtAcquisition: 100_000, acquisitionArea: 1000, standardPriceAtAcquisition: 200_000_000,
        buildingStandardPriceAtAcquisition: 100_000_000, landStandardPriceAtTransfer: 300_000_000, buildingStandardPriceAtTransfer: 100_000_000,
        buildingFootprintArea: 100, appurtenantLandZone: "metropolitan_residential",
      },
    ],
  };
  async function postMulti(body: unknown) {
    const { POST } = await import("@/app/api/calc/transfer/multi/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, json: (await res.json()) as Loose };
  }

  it("다건 — 같은 세대 1세대1주택도 초과분 315,000,000을 비사업용으로 과세(수정 전: 전액 비과세 0)", async () => {
    const r = await postMulti(multiBody);
    const p = r.json.data.properties[0];
    // 토지 양도가액 600,000,000(기준시가 3:1) − 취득가액 150,000,000(2억:1억) = 450,000,000 × 70% = 315,000,000 · 표1 30% 94,500,000
    // 220,500,000 − 2,500,000 = 218,000,000 → 52,060,000 + 68,000,000 × 48% = 84,700,000(§104①8호)
    expect([r.status, p.splitDetail.nonBusinessLandPart.gain, r.json.data.calculatedTax]).toEqual([200, 315_000_000, 84_700_000]);
  });

  it("컴패니언 — 함께 양도한 토지만 본인 주택도 초과분 파트(토지 양도차익의 40%)가 생긴다", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      ...ONE_HOUSE, contractTotalPrice: "1700000000",
      assets: [
        { ...makeDefaultAsset(1), ...PUR, assetKind: "land", actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
        { ...makeDefaultAsset(2), ...PUR, ...EXCESS, selfOwns: "land_only", buildingOwnerSameHousehold: true } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer((await captureBody(f)) as Loose);
    const found: Loose[] = [];
    JSON.stringify(r.json, (_k, v) => {
      if (v && typeof v === "object" && v.selfOwns === "land_only" && v.nonBusinessLandPart) found.push(v);
      return v;
    });
    expect(r.status).toBe(200);
    expect(found.length).toBeGreaterThan(0);
    const sd = found[0];
    expect([sd.nonBusinessLandPart.limitArea, sd.nonBusinessLandPart.excessArea, sd.nonBusinessLandPart.gain]).toEqual([60, 40, Math.floor(sd.land.gain * 0.4)]);
  });
});
