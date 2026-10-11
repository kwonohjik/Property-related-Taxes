/**
 * anchor — 코드 리뷰 결정 #1(권고 C): 양도일과 같은 날 취득한 분양권·조합원입주권의 「확인 필요」 고지가
 * **겸용주택 단건 경로**와 **일괄양도(함께 양도) 경로**에도 붙는다.
 *
 * 결함(독립 검증자 지적, 재현): 단건 주택 경로(`route.ts` 5-b)만 같은 날 권리 반사실을 대조해 고지했다.
 * 겸용(5-a-2)·일괄양도(5-a)는 ⑭에서 같은 날 권리를 보유에서 빼기만 하고 대조하지 않아, 같은 사실에서
 * 결론이 갈리는데도(겸용 139,494,960 → 0, 일괄 128,766,000 → 0) 고지가 없었다 — 결과적으로 권고 A(고지 없음)로 동작했다.
 *
 * 조건 3 「§104⑦·겸용 주택·함께 양도 계산에도 같은 기준」 — 같은 기준 = 제외는 양도일 당일·이후 취득 권리 전부,
 * 고지는 **같은 날 권리를 보유로 세면 결론이 달라질 때만**(양도 다음 날 이후 취득분은 고지 없음).
 *
 * 사실: 주택 2015-01-01 취득 · 2026-06-01 양도 · 권리 r1(2025-03-01 취득, 보유) + r2(취득일만 바꾼다).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { SAME_DAY_RIGHT_NOTICE } from "@/lib/tax-engine/one-house/same-day-right";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";

const rdev = (id: string, acquisitionDate: string) => ({
  id,
  type: "redevelopment_right" as const,
  memberOrigin: "successor" as const,
  acquisitionDate,
  region: "capital" as const,
});
const BEFORE = "2026-04-01";
const SAME = "2026-06-01";
const AFTER = "2026-07-01";

const BASE = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2015-01-01",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
};

const MIXED = {
  ...BASE,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2015-01-01",
    buildingAcquisitionDate: "2015-01-01",
    transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
    residencePeriodYears: 5,
    zoneType: "general_residential" as const,
    isOneHouseExempt: true,
  },
};

const BUNDLED = {
  ...BASE,
  propertyType: "housing" as const,
  transferPrice: 900_000_000,
  totalSalePrice: 1_500_000_000,
  bundledSaleMode: "actual" as const,
  primaryActualSalePrice: 900_000_000,
  standardPriceAtTransferForApportion: 500_000_000,
  companionAssets: [
    {
      assetId: "c1",
      assetLabel: "컴패니언 주택",
      assetKind: "housing" as const,
      propertyType: "housing" as const,
      standardPriceAtTransfer: 300_000_000,
      fixedSalePrice: 600_000_000,
      fixedAcquisitionPrice: 200_000_000,
      acquisitionDate: "2015-01-01",
      acquisitionCause: "purchase" as const,
      residencePeriodMonths: 60,
      isOneHousehold: true,
    },
  ],
};

async function post(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(withIdentityStdInBody(body)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json?.error ?? "").slice(0, 300)).toBe(200);
  return json.data;
}

async function mixed(rights: object[]) {
  const d = await post({ ...MIXED, presaleRights: rights });
  expect(d.mode).toBe("mixed-use");
  const r = d.result as { housingPart: { isExempt: boolean }; total: { totalPayable: number }; warnings: string[] };
  return { exempt: r.housingPart.isExempt, total: r.total.totalPayable, notice: r.warnings.includes(SAME_DAY_RIGHT_NOTICE) };
}

async function bundled(rights: object[]) {
  const d = await post({ ...BUNDLED, presaleRights: rights });
  expect(d.mode).toBe("bundled");
  const a = d.aggregated as { totalTax: number; properties: { propertyId: string; isExempt: boolean }[]; warnings: string[] };
  return {
    total: a.totalTax,
    exempt: a.properties.map((p) => p.isExempt),
    notice: a.warnings.includes(SAME_DAY_RIGHT_NOTICE),
  };
}

describe("겸용주택 단건 — 같은 날 권리 고지 (결정 #1 조건 3)", () => {
  it("[MX-1a] 양도 전 취득 → 권리 2개 §89② 배제(과세 139,494,960) · 고지 없음", async () => {
    const r = await mixed([rdev("r1", "2025-03-01"), rdev("r2", BEFORE)]);
    expect(r).toEqual({ exempt: false, total: 139_494_960, notice: false });
  });
  it("[MX-1b] 같은 날 취득 → 권리 1개로 보아 비과세 0 + 확인 필요 고지(결론이 갈리므로)", async () => {
    const r = await mixed([rdev("r1", "2025-03-01"), rdev("r2", SAME)]);
    expect(r).toEqual({ exempt: true, total: 0, notice: true });
  });
  it("[MX-1c] 양도 다음 날 이후 취득 → 비과세 0 · 고지 없음(문언만으로 보유가 아니다)", async () => {
    const r = await mixed([rdev("r1", "2025-03-01"), rdev("r2", AFTER)]);
    expect(r).toEqual({ exempt: true, total: 0, notice: false });
  });
  it("[MX-1d] 결론을 가르지 않으면 고지 없음 — 같은 날 권리 1개뿐이면 보유로 세어도 비과세(§156의2③ 예외)", async () => {
    const r = await mixed([rdev("r2", SAME)]);
    expect(r).toEqual({ exempt: true, total: 0, notice: false });
  });
});

describe("일괄양도(함께 양도) — 같은 날 권리 고지 (결정 #1 조건 3)", () => {
  it("[BD-1a] 양도 전 취득 → 두 주택 모두 배제, 총세액 128,766,000 · 고지 없음", async () => {
    const r = await bundled([rdev("r1", "2025-03-01"), rdev("r2", BEFORE)]);
    expect(r).toEqual({ total: 128_766_000, exempt: [false, false], notice: false });
  });
  it("[BD-1b] 같은 날 취득 → 두 주택 비과세 0 + 확인 필요 고지", async () => {
    const r = await bundled([rdev("r1", "2025-03-01"), rdev("r2", SAME)]);
    expect(r).toEqual({ total: 0, exempt: [true, true], notice: true });
  });
  it("[BD-1c] 양도 다음 날 이후 취득 → 비과세 0 · 고지 없음", async () => {
    const r = await bundled([rdev("r1", "2025-03-01"), rdev("r2", AFTER)]);
    expect(r).toEqual({ total: 0, exempt: [true, true], notice: false });
  });
  it("[BD-1d] 결론을 가르지 않으면 고지 없음 — 같은 날 권리 1개뿐", async () => {
    const r = await bundled([rdev("r2", SAME)]);
    expect(r).toEqual({ total: 0, exempt: [true, true], notice: false });
  });
});

describe("겸용주택 단건 × §104⑦ 중과 주택 수 — 같은 날 분양권 고지", () => {
  const house = (id: string, acquisitionDate: string) => ({
    id,
    region: "capital" as const,
    acquisitionDate,
    officialPrice: 800_000_000,
    isInherited: false,
    isLongTermRental: false,
  });
  const presale = (id: string, acquisitionDate: string) => ({
    id,
    type: "presale_right" as const,
    acquisitionDate,
    region: "capital" as const,
  });
  async function surcharge(when: string) {
    const d = await post({
      ...MIXED,
      mixedUse: { ...MIXED.mixedUse, isOneHouseExempt: false },
      transferPrice: 3_000_000_000,
      householdHousingCount: 2,
      isRegulatedArea: true,
      houses: [house("selling", "2015-01-01"), house("h2", "2016-03-01")],
      sellingHouseId: "selling",
      presaleRights: [presale("p1", when)],
    });
    const r = d.result as { total: { totalPayable: number }; warnings: string[] };
    return { total: r.total.totalPayable, notice: r.warnings.includes(SAME_DAY_RIGHT_NOTICE) };
  }
  it("[MX-2] 같은 날 분양권만 주택 수 산입이 갈리므로 고지 — 양도 전은 산입(고지 없음) · 양도 후는 제외(고지 없음)", async () => {
    const before = await surcharge(BEFORE);
    const same = await surcharge(SAME);
    const after = await surcharge(AFTER);
    // 양도 전 분양권은 주택 수에 산입(3주택 중과) · 같은 날·양도 후는 제외(2주택 중과) — 같은 날만 고지.
    expect(before).toEqual({ total: 861_011_360, notice: false });
    expect(same).toEqual({ total: 758_656_360, notice: true });
    expect(after).toEqual({ total: 758_656_360, notice: false });
  });
});
