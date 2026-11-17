/**
 * V-4(#3436) 토지만 본인 × 토지 나중 취득 — 함께 양도(컴패니언)·다건(연간 합산)도 단건과 같은 토지분 거주 규칙인가(2026-11-17 실측 · 결함 없음).
 *
 * 시료: 건물 2010-03-01 매수(세대원 소유 · 같은 세대) · 토지 2020-03-01 본인 매수 · 양도 2025-01-15 · 20억 · 1세대1주택.
 * 「별개 취득 토글」은 끈 채(토지만 본인이면 ④가 토글 없이 토지 취득일을 싣는다) — 토지·건물 모두 본인 + 토글 ON 시료와 토지분이 같아야 한다.
 *
 * | 거주 입력 | ④ 겹침 키 | 토지 공제율 · 거주 연수 | 단건 = 다건 합계 총세액 |
 * |---|---|---|---|
 * | 구간 2010-06-01~2025-01-15 | 58 | 32% · 4년(보유 4년 16% + 거주 4년 16%) | 34,413,500 |
 * | 구간 2010-06-01~2015-05-31(토지 취득 전만) | 0 | 16% · 0년 | 47,245,000 |
 * | 직접 60개월 | 없음 | 32% · 4년(엔진이 토지 보유 58개월로 상한) | 34,413,500 |
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md (V-4 미측정 — 컴패니언·다건 토지만 본인).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", async (o) => ({
  ...(await o<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { runSingle } from "./_helpers/single-multi-route-parity";
import { buildMultiBody } from "./_helpers/single-multi-route-parity";
import { postMulti } from "./_helpers/single-multi-route-parity";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const interval = (...p: [string, string][]) => ({ residenceInputMode: "interval", residencePeriods: p.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) });
const LAND_ONLY = { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, hasSeperateLandAcquisitionDate: false, fixedAcquisitionPrice: "900,000,000" };
const BOTH = { hasSeperateLandAcquisitionDate: true };
const house = (id: number, o: L) => ({
  ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
  landAcquisitionDate: "2020-03-01", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "900,000,000", buildingAcquisitionPrice: "100,000,000",
  actualSalePrice: "2,000,000,000", saleSplitMode: "actual", landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000",
  landStandardPriceAtTransfer: "1,400,000,000", buildingStandardPriceAtTransfer: "600,000,000", ...o,
});
const land1 = () => ({
  ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000",
  actualSalePrice: "300000000", standardPriceAtTransfer: "100000000", addressJibun: "서울 테스트동 9", acquisitionArea: "300", transferArea: "300",
});
const hh = { transferDate: "2025-01-15", filingDate: "2025-03-31", isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0" };
const single = (o: L) => ({ ...createDefaultTransferFormData(), ...hh, contractTotalPrice: "2000000000", assets: [house(1, o)] }) as never;
const bundled = (o: L) => ({ ...createDefaultTransferFormData(), ...hh, contractTotalPrice: "2300000000", bundledSaleMode: "actual", assets: [land1(), house(2, o)] }) as never;

const CASES: [string, L, number | undefined, number, number, number][] = [
  ["구간 — 토지 보유 중 58개월", interval(["2010-06-01", "2025-01-15"]), 58, 0.32, 4, 34_413_500],
  ["구간 — 토지 취득 전만(겹침 0)", interval(["2010-06-01", "2015-05-31"]), 0, 0.16, 0, 47_245_000],
  ["직접 60개월 — 엔진 상한", { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "60" }, undefined, 0.32, 4, 34_413_500],
];

describe("토지만 본인 × 토지 나중 — 단건 · 컴패니언 · 다건이 같은 토지분", () => {
  for (const [name, res, key, rate, years, tax] of CASES)
    it(name, async () => {
      const o = { ...LAND_ONLY, ...res };
      const s = await runSingle(single(o));
      expect(s.status).toBe(200);
      expect(s.body.landHoldingResidenceMonths).toBe(key);
      expect(s.totalTax).toBe(tax);
      const sl = (s.r.splitDetail as L).land;
      expect(sl.longTermRate).toBeCloseTo(rate, 10);
      expect(sl.residenceYears).toBe(years);

      const c = await runCalc(bundled(o));
      expect(c.issues).toEqual([]);
      expect(c.status).toBe(200);
      expect((c.body.companionAssets as L[])[0].landHoldingResidenceMonths).toBe(key);
      const cp = (c.json.data.aggregated.properties as L[]).find((p) => p.propertyId !== "primary")!;
      expect(cp.splitDetail.land.longTermRate).toBeCloseTo(rate, 10);
      expect(cp.splitDetail.land.residenceYears).toBe(years);

      const mb = await buildMultiBody([single(o)]);
      expect((mb.properties as L[])[0].landHoldingResidenceMonths).toBe(key);
      const m = await postMulti(mb);
      expect(m.status).toBe(200);
      expect(m.totalTax).toBe(tax);
      expect((m.props[0] as L).splitDetail.land.longTermRate).toBeCloseTo(rate, 10);
    });

  it("짝 — 토지·건물 모두 본인 + 토글 ON과 토지분이 같다(컴패니언 · 다건)", async () => {
    for (const [name, res, key, rate] of CASES) {
      const both = await runCalc(bundled({ ...BOTH, ...res }));
      const lo = await runCalc(bundled({ ...LAND_ONLY, ...res }));
      const land = (r: L) => (r.json.data.aggregated.properties as L[]).find((p) => p.propertyId !== "primary")!.splitDetail.land.longTermRate;
      expect(land(both), name).toBeCloseTo(land(lo), 10);
      expect((both.body.companionAssets as L[])[0].landHoldingResidenceMonths, name).toBe(key);
      const mb = await buildMultiBody([single({ ...BOTH, ...res })]);
      expect(((await postMulti(mb)).props[0] as L).splitDetail.land.longTermRate, name).toBeCloseTo(rate, 10);
    }
  });
});
