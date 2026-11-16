/**
 * 축 B(같은 주택 지분 분할) × 토지를 건물보다 나중에 취득 × 구간 입력 — 화면 경로(폼 → ④ companion payload → ⑧ → ⑫ → ⑭ → 엔진)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 (PR-2 남은 한계 1)
 * 지분 카드는 거주를 첫 지분 칸에서 승계한다. 종전에는 ④가 지분 카드에 겹침 키를 싣지 않아, 구간 입력이어도 엔진이 직접 입력 상한(min)으로 계산했다 —
 * 같은 주택인데 첫 지분은 토지 16% · 둘째 지분은 32%, 고지 1건(「구간으로 입력하면 …」)이 났다(실측 총세액 92,389,000 → 수정 후 95,733,000).
 * 시료: 지분 1/2 두 장 · 건물 2010-03-01 · 토지 2020-03-01 별개 취득 · 거주 구간 2010-06-01~2015-05-31(토지 취득 전만) · 양도 2025-01-15 · 20억.
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
import { landHoldingResidenceDirectHintApplies } from "@/lib/calc/transfer-land-holding-residence-scope";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const interval = (...p: [string, string][]): Partial<AssetForm> =>
  ({ residenceInputMode: "interval", residencePeriods: p.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) }) as Partial<AssetForm>;
const direct = (m: string): Partial<AssetForm> => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: m }) as Partial<AssetForm>;

const share = (n: number, o: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(n), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "450,000,000", buildingAcquisitionPrice: "50,000,000", actualSalePrice: "1,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000", landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000", ownershipNumerator: "1", ownershipDenominator: "2", ...o,
  }) as unknown as AssetForm;

const form = (p: AssetForm, s: AssetForm, mode: "fractional" | "companion" = "fractional") =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2025-01-15", filingDate: "2025-03-31", contractTotalPrice: "2000000000", isOneHousehold: true, householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", assetSplitMode: mode, bundledSaleMode: "actual", assets: [p, s],
  }) as never;

type R = Awaited<ReturnType<typeof runCalc>>;
type Prop = { propertyId: string; longTermHoldingDeduction: number; splitDetail?: { land: { longTermRate: number }; building: { longTermRate: number } } };
const comp = (r: R) => (r.body.companionAssets as Record<string, unknown>[])[0];
const props = (r: R) => r.json.data.aggregated.properties as Prop[];
const second = (r: R) => props(r).find((p) => p.propertyId !== "primary")!;
const first = (r: R) => props(r).find((p) => p.propertyId === "primary")!;
const capNotes = (r: R) => ((r.json?.data?.aggregated?.warnings ?? []) as string[]).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("축 B 지분 카드 — ④ 구간 입력 겹침", () => {
  it("🔑 같은 날 취득한 두 지분: 둘째 지분에도 겹침 0을 싣는다 · 토지 16%(첫 지분과 같다) · 고지 0건", async () => {
    const r = await runCalc(form(share(1, interval(["2010-06-01", "2015-05-31"])), share(2)));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json?.error ?? {})).toBe(200);
    expect(r.body.landHoldingResidenceMonths).toBe(0);
    expect(comp(r).landHoldingResidenceMonths).toBe(0);
    expect(second(r).splitDetail!.land.longTermRate).toBeCloseTo(0.16, 10); // 보유 4년 16% + 거주 0(토지 보유 전 거주만)
    expect(second(r).splitDetail!.building.longTermRate).toBeCloseTo(0.6, 10); // 건물은 그대로 — 보유 14년 40% + 거주 5년 20%
    expect(second(r).longTermHoldingDeduction).toBe(first(r).longTermHoldingDeduction);
    expect(capNotes(r)).toHaveLength(0);
    expect(r.json.data.aggregated.totalTax).toBe(95_733_000);
  });

  it("늦게 취득한 지분(건물 2012-03-01 · 토지 2021-03-01): 거주 합계는 그 지분 보유 중(종전 규칙) · 겹침은 그 지분의 토지 취득일부터", async () => {
    const r = await runCalc(
      form(share(1, interval(["2010-06-01", "2024-12-31"])), share(2, { acquisitionDate: "2012-03-01", landAcquisitionDate: "2021-03-01" } as Partial<AssetForm>)),
    );
    expect(r.status, JSON.stringify(r.json?.error ?? {})).toBe(200);
    expect(comp(r).residencePeriodMonths).toBe(154); // 2012-03-01~2024-12-31
    expect(comp(r).landHoldingResidenceMonths).toBe(46); // 2021-03-01~2024-12-31
    expect(r.body.landHoldingResidenceMonths).toBe(58); // 첫 지분 — 2020-03-01~2024-12-31
    expect(second(r).splitDetail!.land.longTermRate).toBeCloseTo(0.24, 10); // 보유 3년 12% + 거주 3년 12%
    expect(capNotes(r)).toHaveLength(0);
  });

  it("짝 — 직접 입력: 키 없음 · 엔진이 지분마다 토지 보유 개월로 상한(고지 2건)", async () => {
    const r = await runCalc(form(share(1, direct("60")), share(2)));
    expect(r.status).toBe(200);
    expect(comp(r)).not.toHaveProperty("landHoldingResidenceMonths");
    expect(second(r).splitDetail!.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(capNotes(r)).toHaveLength(2);
  });

  it("짝 — 둘째 지분 토지가 먼저 취득(2000-03-01): 그 카드에는 키 없음 · route 200", async () => {
    const r = await runCalc(form(share(1, interval(["2010-06-01", "2015-05-31"])), share(2, { landAcquisitionDate: "2000-03-01" } as Partial<AssetForm>)));
    expect(r.status).toBe(200);
    expect(comp(r)).not.toHaveProperty("landHoldingResidenceMonths");
  });
});

describe("⑤ 직접 입력 안내 게이트 — 축 B 지분이 토지 나중 취득이면 첫 지분 칸에 안내", () => {
  const plain = { hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "" } as Partial<AssetForm>;
  it("첫 지분은 분리 아님 · 둘째 지분만 토지 나중 취득 → 안내", () => {
    const p = share(1, { ...direct("60"), ...plain });
    expect(landHoldingResidenceDirectHintApplies(p, [p, share(2)], "fractional")).toBe(true);
  });
  it("짝 — 둘째 지분도 분리 아님 → 안내 없음 · 구간 입력 → 안내 없음", () => {
    const p = share(1, { ...direct("60"), ...plain });
    expect(landHoldingResidenceDirectHintApplies(p, [p, share(2, plain)], "fractional")).toBe(false);
    const pi = share(1, { ...interval(["2010-06-01", "2015-05-31"]), ...plain });
    expect(landHoldingResidenceDirectHintApplies(pi, [pi, share(2)], "fractional")).toBe(false);
  });
  it("짝 — 함께 양도(다른 물건)로 선언하면 지분 규칙이 아니다", () => {
    const p = share(1, { ...direct("60"), ...plain });
    expect(landHoldingResidenceDirectHintApplies(p, [p, share(2)], "companion")).toBe(false);
  });
});
