/**
 * 부담부증여 × 토지를 건물보다 나중에 취득한 분리취득 주택 × 거주 구간 입력 — 화면 경로(폼 → ⑧ → ④ → ⑫ → ⑭ → 엔진)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 (PR-2 #3422 남은 한계 「부담부증여 × 구간 ⑫ 수락 미확인」을 실측으로 닫는다 · 결함 없음)
 * 토지 파트 거주분 공제율은 토지 보유기간 중 거주만 센다. 구간 입력이면 ④가 겹침 개월(`landHoldingResidenceMonths`)을 싣고 ⑫·엔진이 그 값을 쓴다 —
 * 부담부증여(시가 평가 · 파트별 평가액·실지취득가액)에서도 일반 매매와 같은 값이 닿는지 고정한다.
 *
 * 시료: 건물 2010-03-01 · 토지 2020-03-01 별개 취득 · 거주 2010-06-01~2015-05-31(토지 취득 전만 · 60개월) · 양도(증여) 2025-01-15 ·
 * 시가 20억(토지 14억 · 건물 6억) · 근저당 채무 8억 · 1세대1주택.
 * 손계산: 토지 공제율 구간 16%(보유 4년 · 거주 겹침 0) vs 직접 60개월 32%(토지 보유 58개월로 상한 → 4년 16%) —
 * 장특 차 = 토지 차익 5억 × 채무비율 0.4 × 고가주택 (20억−12억)/20억 0.4 × 16%p = 12,800,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
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
const BEFORE_LAND = interval(["2010-06-01", "2015-05-31"]);

const BG = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "2000000000", bgDonorRelation: "lineal_descendant",
  bgMortgageDebtAmount: "800000000", bgMortgageSetAmount: "960000000", bgMarketValueLand: "1400000000", bgMarketValueBuilding: "600000000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "900000000", bgActualAcquisitionBuilding: "100000000",
} as Partial<AssetForm>;

const house = (o: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "900,000,000", buildingAcquisitionPrice: "100,000,000", actualSalePrice: "2,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000", landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000", standardPriceAtTransfer: "2,000,000,000", ...BG, ...BEFORE_LAND, ...o,
  }) as unknown as AssetForm;

/** 축 B 지분 1/2 — 같은 주택 · 거주는 첫 지분 칸 하나(지분 카드는 승계) */
const share = (n: number, o: Partial<AssetForm> = {}) =>
  house({
    assetId: makeDefaultAsset(n).assetId, assetLabel: makeDefaultAsset(n).assetLabel, landAcquisitionPrice: "450,000,000", buildingAcquisitionPrice: "50,000,000", actualSalePrice: "1,000,000,000",
    landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000", ownershipNumerator: "1", ownershipDenominator: "2",
    bgActualAcquisitionLand: "450000000", bgActualAcquisitionBuilding: "50000000", ...o,
  } as Partial<AssetForm>);

const form = (assets: AssetForm[], extra: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2025-01-15", filingDate: "2025-03-31", contractTotalPrice: "2000000000", isOneHousehold: true, householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", assets, ...extra,
  }) as never;

type R = Awaited<ReturnType<typeof runCalc>>;
type Res = { splitDetail?: { land: { longTermRate: number }; building: { longTermRate: number } }; longTermHoldingDeduction: number; warnings?: string[] };
const single = (r: R) => r.json.data.result as Res;
const capNotes = (ws: string[] | undefined) => (ws ?? []).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("부담부증여 × 토지 나중 취득 — 단건", () => {
  it("🔑 구간 입력: ④ 겹침 0 전송 · ⑧ 통과 · ⑫ 200 · 토지 16%(건물 60% 그대로) · 고지 0건", async () => {
    const r = await runCalc(form([house()]));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json?.error ?? {})).toBe(200);
    expect(r.body.transferType).toBe("burdened_gift");
    expect(r.body.residencePeriodMonths).toBe(60);
    expect(r.body.landHoldingResidenceMonths).toBe(0);
    expect(single(r).splitDetail!.land.longTermRate).toBeCloseTo(0.16, 10);
    expect(single(r).splitDetail!.building.longTermRate).toBeCloseTo(0.6, 10);
    expect(capNotes(single(r).warnings)).toHaveLength(0);
  });

  it("짝 — 직접 입력 60개월: 키 없음 · 엔진 상한(토지 32%) · 고지 1건 · 장특 차 12,800,000(손계산)", async () => {
    const ri = await runCalc(form([house()]));
    const rd = await runCalc(form([house(direct("60"))]));
    expect(rd.status).toBe(200);
    expect(rd.body).not.toHaveProperty("landHoldingResidenceMonths");
    expect(single(rd).splitDetail!.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(capNotes(single(rd).warnings)).toHaveLength(1);
    expect(single(rd).longTermHoldingDeduction - single(ri).longTermHoldingDeduction).toBe(12_800_000);
  });
});

describe("부담부증여 × 축 B 지분 — 지분 카드도 첫 지분 구간으로 겹침을 받는다(#3429)", () => {
  it("두 지분 모두 겹침 0 전송 · 토지 16% · 장특 같음 · 고지 0건", async () => {
    const r = await runCalc(form([share(1), share(2)], { assetSplitMode: "fractional" }));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json?.error ?? {})).toBe(200);
    expect(r.body.landHoldingResidenceMonths).toBe(0);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].landHoldingResidenceMonths).toBe(0);
    const props = r.json.data.aggregated.properties as (Res & { propertyId: string })[];
    expect(props).toHaveLength(2);
    for (const p of props) expect(p.splitDetail!.land.longTermRate, p.propertyId).toBeCloseTo(0.16, 10);
    expect(props[0].longTermHoldingDeduction).toBe(props[1].longTermHoldingDeduction);
    expect(capNotes(r.json.data.aggregated.warnings)).toHaveLength(0);
  });
});
