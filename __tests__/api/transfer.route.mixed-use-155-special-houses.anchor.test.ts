/**
 * anchor — **겸용주택 × §155⑥·⑦·⑧ 1주택 의제** 비과세 판정 (재검증 S08-3 · PR5b).
 *
 * 「소득세법 시행령」 §155⑥·⑦·⑧은 특례 주택(문화유산·농어촌·수도권 밖 부득이)과 「그 밖의 주택(일반주택)」을 각각
 * 1개씩 소유한 1세대가 일반주택을 양도하면 「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을
 * 적용한다」고 정한다. 같은 영 §154③은 겸용주택을 주택으로 본다(주택 연면적이 더 크면 전부, 아니면 주택 부분).
 * 일반주택에서 겸용주택을 빼는 문언이 없으므로 같은 세대 사실에서 일반 주택이 비과세면 겸용 주택분도 비과세여야 한다.
 *
 * 종전에는 겸용 판정이 `ruralHouse: undefined`로 §155⑦을 막고 ⑥·⑧은 아예 받지 않아, 일반 주택은 0원인 세대가
 * 겸용이면 1.65억대 과세였다(경고 없음). 겸용주택 × §155⑥⑦⑧을 정면으로 다룬 해석례는 확보하지 못했다 — 「확인 필요」.
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
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine()));

const COMMON = {
  transferPrice: 1_000_000_000,
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2016-06-01",
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};
const MIXED = {
  ...COMMON,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: "2016-06-01",
    buildingAcquisitionDate: "2016-06-01",
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 3_000_000 },
    acquisitionStandardPrice: { housingPrice: 200_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
    // ④(`transfer-tax-api-mixed-use.ts`)가 세대 주택 수 2이면 싣는 값 — 「2주택이라 일반 비과세 아님」.
    isOneHouseExempt: false,
  },
};
const GENERAL = { ...COMMON, propertyType: "housing" as const };

const FACTS: Record<string, Record<string, unknown>> = {
  none: {},
  uoc: { unavoidableOutsideCapitalHouse: { reason: "work" } },
  rural: { ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 5 } },
  cult: { culturalHeritageHouse: true },
  tth: { temporaryTwoHouse: { previousAcquisitionDate: "2016-06-01", newAcquisitionDate: "2025-12-01" } },
};

interface MixedResult {
  housingPart: { isExempt: boolean; transferGain: number; proratedTaxableGain: number };
  total: { determinedTax: number };
  warnings?: string[];
}

async function post(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
async function general(over: Record<string, unknown>) {
  const { status, json } = await post({ ...GENERAL, ...over });
  expect(status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result as { isExempt: boolean; isPartialExempt: boolean; totalTax: number };
}
async function mixed(over: Record<string, unknown>, mixedUseOver: Record<string, unknown> = {}) {
  const { status, json } = await post(
    withIdentityStdInBody({ ...MIXED, ...over, mixedUse: { ...MIXED.mixedUse, ...mixedUseOver } }),
  );
  expect(status, JSON.stringify(json).slice(0, 300)).toBe(200);
  expect(json.data.mode).toBe("mixed-use");
  return json.data.result as MixedResult;
}

describe("S08-3 — 겸용 × §155⑥·⑦·⑧ → 일반 주택과 같은 비과세", () => {
  for (const k of ["uoc", "rural", "cult"] as const) {
    it(`MIXED-${k}: 같은 세대 사실의 일반 주택이 비과세면 겸용 주택분도 비과세`, async () => {
      const g = await general(FACTS[k]);
      expect(g.isExempt, "대조: 일반 주택은 비과세").toBe(true);
      const r = await mixed(FACTS[k]);
      expect(r.housingPart.isExempt).toBe(true);
    });
  }

  it("MIXED-uoc: 확인 필요 고지가 붙는다(겸용 × §155⑥⑦⑧ 정면 해석례 미확보)", async () => {
    const r = await mixed(FACTS.uoc);
    expect((r.warnings ?? []).some((w) => w.includes("확인 필요") && w.includes("§155⑧"))).toBe(true);
  });

  // ── 부정 짝 — 의제가 없거나 요건이 안 맞으면 종전대로 과세 ──
  it("MIXED-none: 특례 선언이 없으면 2주택 전액 과세(종전과 같다)", async () => {
    const r = await mixed(FACTS.none);
    expect(r.housingPart.isExempt).toBe(false);
  });

  it("3주택이면 ⑥은 성립하지 않는다(「각각 1개씩」= 2주택)", async () => {
    const g = await general({ ...FACTS.cult, householdHousingCount: 3 });
    expect(g.isExempt).toBe(false);
    const r = await mixed({ ...FACTS.cult, householdHousingCount: 3 });
    expect(r.housingPart.isExempt).toBe(false);
  });

  it("⑧ 해소일부터 3년을 넘기면 불성립 — 일반 주택과 같이 과세", async () => {
    const f = { unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: "2022-01-01" } };
    const g = await general(f);
    expect(g.isExempt).toBe(false);
    const r = await mixed(f);
    expect(r.housingPart.isExempt).toBe(false);
  });

  it("§154① 보유 2년 미만이면 ⑥이 있어도 비과세 아님(「제154조제1항을 적용」)", async () => {
    const f = { ...FACTS.cult, acquisitionDate: "2025-06-01" };
    const g = await general(f);
    expect(g.isExempt).toBe(false);
    const r = await mixed(f, { buildingAcquisitionDate: "2025-06-01", landAcquisitionDate: "2025-06-01" });
    expect(r.housingPart.isExempt).toBe(false);
  });

  it("1세대가 아니면 ⑥⑦⑧ 의제를 쓰지 않는다", async () => {
    const r = await mixed({ ...FACTS.cult, isOneHousehold: false });
    expect(r.housingPart.isExempt).toBe(false);
  });

  it("고가(12억 초과) 겸용 — 의제가 서면 일반 주택처럼 초과분만 과세(안분), 아니면 전액 과세", async () => {
    const hv = {
      transferPrice: 3_000_000_000,
      acquisitionPrice: 700_000_000,
    };
    const hvStd = {
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 },
    };
    const none = await mixed({ ...FACTS.none, ...hv }, hvStd);
    const cult = await mixed({ ...FACTS.cult, ...hv }, hvStd);
    expect(none.housingPart.isExempt).toBe(false);
    expect(none.housingPart.proratedTaxableGain, "의제 없음 = 안분 없이 전액 과세").toBe(none.housingPart.transferGain);
    expect(cult.housingPart.isExempt).toBe(false);
    expect(cult.housingPart.proratedTaxableGain, "⑥ 의제 = 12억 초과분 안분").toBeLessThan(cult.housingPart.transferGain);
  });

  // ── 긍정 대조군 — 배관은 정상이고 ⑥⑦⑧ 축만 빠져 있었다 ──
  it("MIXED-tth(§155① 일시적 2주택)는 종전에도 비과세", async () => {
    const r = await mixed(FACTS.tth);
    expect(r.housingPart.isExempt).toBe(true);
  });
});
