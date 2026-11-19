/**
 * NBL2611-C1 anchor (V10-BX08) — 일반건물 3경로(환산·증축·실거래가) × 3상태(한도 이내·초과분·무허가 단서)의 **토지 카드 구성**.
 *
 * 결함(수정 전 실측): 증축·실거래가 경로의 무허가 단서(전체 비사업용)에서
 *   0원 「토지-사업용(1001)」 유령 카드 + 전체인데 「토지-비사업용초과분(1002)」로 오표기.
 *   (증축이면 카드가 4장이 되어 3자산 요약표가 사라진다 — `__tests__/components/gb-3way-land-split-nbl2611-c1.anchor.test.tsx`)
 *
 * 세액 불변: 결정세액 9칸은 **수정 전 실측값 그대로**다(유령 카드는 양도차익 0이라 세액 기여 0).
 * 시료: 양도 10억 · 토지 200㎡ · 상업지역(배율 3) · 바닥면적 20㎡(초과분 140㎡ · 비율 0.7) / 100㎡(한도 이내) / 무허가 단서.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 1_000_000_000, acquisitionDate: "2003-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const base = (o: object) => ({
  transferLandPricePerSqm: 3_000_000, transferBuildingStdPrice: 100_000_000, landArea: 200, buildingArea: 100, buildingFootprintArea: 20,
  zoneType: "commercial", isMetropolitan: false, acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 50_000_000,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2003-03-17", landAcquisitionDate: "2003-03-17", landAcquisitionCause: "purchase",
  unapprovedBuilding: false, unregisteredLand: false, unregisteredBuilding: false, ...o,
});
const ext = { extensionInfo: { extensionDate: "2018-06-01", extensionAcquisitionCause: "purchase", acquisitionMode: "estimated", transferExtensionBuildingStdPrice: 20_000_000, acquisitionExtensionBuildingStdPrice: 10_000_000 } };
const actual = { actualPriceMode: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 100_000_000, isSelfBuilt: false };


interface Prop { propertyId: string; propertyLabel: string; transferPrice: number; transferGain: number }
async function run(gbv: object, top: object = {}) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...COMMON, ...top, generalBuildingValuation: gbv }),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const a = json.data.aggregated;
  return {
    tax: a.determinedTax as number,
    props: (a.properties as Prop[]).map((p) => [p.propertyId, p.propertyLabel] as const),
    landGain: (a.properties as Prop[]).filter((p) => p.propertyId.startsWith("land")).reduce((s, p) => s + p.transferGain, 0),
    landTransfer: (a.properties as Prop[]).filter((p) => p.propertyId.startsWith("land")).reduce((s, p) => s + p.transferPrice, 0),
  };
}

const actualTop = { acquisitionPrice: 400_000_000, useEstimatedAcquisition: false, totalPropertyTransferPrice: 1_000_000_000 };
const PATHS = {
  est: { gbv: (w: object) => base(w), top: {} },
  ext: { gbv: (w: object) => base({ ...w, ...ext }), top: {} },
  act: { gbv: (w: object) => base({ ...w, ...actual }), top: actualTop },
} as const;
const STATES = {
  within: { w: { buildingFootprintArea: 100 }, ids: [["land", "토지(1001)"]] },
  split: { w: {}, ids: [["land_business", "토지-사업용(1001)"], ["land_nbl", "토지-비사업용초과분(1002)"]] },
  whole: { w: { unapprovedBuilding: true }, ids: [["land_nbl", "토지-비사업용(1001)"]] },
} as const;
// 수정 전 실측 결정세액(= 수정 후 같아야 한다)
const TAX = {
  "est-within": 150_960_000, "ext-within": 253_865_787, "act-within": 141_060_000,
  "est-split": 155_631_000, "ext-split": 265_025_235, "act-split": 145_910_000,
  "est-whole": 176_792_500, "ext-whole": 288_866_489, "act-whole": 171_050_000,
} as const;

describe("NBL2611-C1 V10-BX08 — GB 토지 카드 구성 단일 leaf (3경로 × 3상태)", () => {
  for (const [pn, path] of Object.entries(PATHS)) {
    for (const [sn, st] of Object.entries(STATES)) {
      it(`${pn}-${sn}: 토지 카드 = ${st.ids.map((i) => i[1]).join(" + ")} · 세액 ${TAX[`${pn}-${sn}` as keyof typeof TAX].toLocaleString("ko-KR")} 불변`, async () => {
        const r = await run(path.gbv(st.w), path.top);
        const lands = r.props.filter(([id]) => id.startsWith("land"));
        expect(lands).toEqual(st.ids.map((i) => [...i]));
        expect(r.tax).toBe(TAX[`${pn}-${sn}` as keyof typeof TAX]);
      });
    }
  }

  it("전체 비사업용 — 토지 양도가·양도차익이 카드 하나에 전액(유령 카드 0원 몫 없음)", async () => {
    const r = await run(PATHS.ext.gbv(STATES.whole.w));
    expect(r.landTransfer).toBe(833_333_333);
    expect(r.landGain).toBe(833_333_333);
  });
});
