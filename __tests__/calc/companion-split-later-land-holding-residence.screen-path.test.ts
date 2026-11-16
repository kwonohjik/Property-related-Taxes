/**
 * 함께 양도 컴패니언 split 주택 × 토지 나중 취득 × 구간 입력 — 화면 경로(폼 → ④ companion payload → ⑧ → ⑫ → ⑭ → 엔진)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 · 동기화 점검 1번(High)
 * 컴패니언 payload에는 `propertyType`이 없고 `assetKind`만 있다 — ④(`transfer-tax-api-bundled.ts`)가 `propertyType`을 읽으면 항상 undefined라
 * 구간 입력이어도 겹침 키가 실리지 않고 엔진이 직접 입력 상한으로 처리한다(토지 32% · 고지 1건 — 맞는 값은 16% · 고지 0건).
 * 시료: 첫 자산 토지(세대 기준은 둘째 주택) · 둘째 split 주택(건물 2010-03-01 · 토지 2020-03-01 · 구간 2010-06-01~2015-05-31 = 토지 보유 전 거주 60개월) · 양도 2025-01-15.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const interval = (...p: [string, string][]): Partial<AssetForm> =>
  ({ residenceInputMode: "interval", residencePeriods: p.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) }) as Partial<AssetForm>;
const direct = (m: string): Partial<AssetForm> => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: m }) as Partial<AssetForm>;

const land1 = () =>
  ({
    ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000",
    actualSalePrice: "300000000", standardPriceAtTransfer: "100000000", addressJibun: "서울 테스트동 9", acquisitionArea: "300", transferArea: "300",
  }) as unknown as AssetForm;

const splitHouse = (o: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "900,000,000", buildingAcquisitionPrice: "100,000,000", actualSalePrice: "2,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000", landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000", ...interval(["2010-06-01", "2015-05-31"]), ...o,
  }) as unknown as AssetForm;

const form = (house: AssetForm) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2025-01-15", filingDate: "2025-03-31", contractTotalPrice: "2300000000", isOneHousehold: true, householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", bundledSaleMode: "actual", assets: [land1(), house],
  }) as never;

type R = Awaited<ReturnType<typeof runCalc>>;
const comp = (r: R) => (r.body.companionAssets as Record<string, unknown>[])[0];
const split = (r: R) => (r.json.data.aggregated.properties as { propertyId: string; splitDetail?: { land: { longTermRate: number }; building: { longTermRate: number } } }[]).find((p) => p.propertyId !== "primary")!.splitDetail!;
const capNotes = (r: R) => ((r.json?.data?.aggregated?.warnings ?? []) as string[]).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("컴패니언 split 주택 — ④ 구간 입력 겹침", () => {
  it("구간 2010-06-01~2015-05-31(토지 취득 전만): 둘째 카드 body에 landHoldingResidenceMonths 0 · 토지 거주분 없음 · 고지 0건", async () => {
    const r = await runCalc(form(splitHouse()));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json?.error ?? {})).toBe(200);
    expect(comp(r).landHoldingResidenceMonths).toBe(0);
    expect(capNotes(r)).toHaveLength(0);
    expect(split(r).land.longTermRate).toBeCloseTo(0.16, 10); // 보유 4년 16% + 거주 0(토지 보유 전 거주만 — 겹침 0)
    expect(split(r).building.longTermRate).toBeCloseTo(0.6, 10); // 보유 14년 40% + 거주 5년 20%
  });

  it("짝 — 직접 입력 60개월: 키 없음 · 엔진이 보유 개월로 상한(고지 1건)", async () => {
    const r = await runCalc(form(splitHouse(direct("60"))));
    expect(comp(r)).not.toHaveProperty("landHoldingResidenceMonths");
    expect(r.status).toBe(200);
    expect(capNotes(r)).toHaveLength(1);
    expect(split(r).land.longTermRate).toBeCloseTo(0.32, 10); // 직접 60개월은 보유 58개월로 상한 — 거주 4년 16%
  });

  it("짝 — 토지가 먼저 취득(2000-03-01): 키 없음 · route 200", async () => {
    const r = await runCalc(form(splitHouse({ landAcquisitionDate: "2000-03-01" } as Partial<AssetForm>)));
    expect(comp(r)).not.toHaveProperty("landHoldingResidenceMonths");
    expect(r.status).toBe(200);
  });
});
