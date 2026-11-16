/**
 * 자산 단위 이월과세(`carryover_gift`) × 토지를 건물(증여 등기접수일)보다 나중에 취득 — 화면 경로(폼 → ④ → ⑫ → ⑭ → 엔진) 동작 고정 (동기화 점검 7번 a)
 *
 * 파트 이월과세(토지만·건물만·증여자 분리 — `anyPartCarryover`)와 달리 자산 단위 이월과세는 ④가 겹침 키를 싣고 엔진이 규칙을 적용한다(엔진 시니어 보고는 skip이었으나 실측은 적용).
 * 수증자 본인이 토지를 매수했으므로 토지 보유는 어느 시나리오든 토지 취득일부터라 적용이 규칙과 맞다 — **동작을 바꾸지 않고 잠근다.**
 * 시료: 증여 등기접수일(건물 취득일) 2010-03-01 · 증여자 취득 2000-01-01 · 토지 매수 2020-03-01 · 양도 2025-01-15 20억 · 1세대 1주택 · 구간 2010-06-01~2025-01-15(175개월) 또는 직접 178개월.
 * 실측값(mock 세율): 구간 → 키 58 · 토지 32% · 건물 80% · 산출세액 45,990,000 · 고지 0 / 직접 178 → 키 없음 · 같은 32% · 45,990,000 · 고지 1.
 * 판정 기준일이 증여자 취득일(2000-01-01)이 아니라 증여 등기접수일이라는 점도 잠근다 — 토지 2005-01-01(증여자 취득일 뒤 · 접수일 앞)은 「토지가 먼저」(키 없음 · 거주 14년 그대로).
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
import { POST } from "@/app/api/calc/transfer/route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { anyPartCarryover } from "@/lib/calc/transfer-land-part-cause";
import { landHoldingResidenceApplies } from "@/lib/calc/transfer-land-holding-residence-scope";
import { bodyOf, cForm, issuesOf, routeOf } from "./_helpers/split-carryover-c-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const interval = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2010-06-01", moveOutDate: "2025-01-15" }] };
const direct = { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "178" };

const asset = (res: Record<string, unknown>, o: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2010-03-01",
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-03-01", landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "900000000", buildingAcquisitionPrice: "100000000", actualSalePrice: "2,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000", landStandardPriceAtTransfer: "1,400,000,000", buildingStandardPriceAtTransfer: "600,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS, giftRegistryDate: "2010-03-01", donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "200000000",
      giftTaxAmount: "0", donorRelation: "spouse", donorSameHousehold: "no",
    },
    ...res, ...o,
  }) as unknown as AssetForm;

async function run(a: AssetForm) {
  const f = cForm({ transferDate: "2025-01-15", filingDate: "2025-03-31", contractTotalPrice: "2000000000", isOneHousehold: true, householdHousingCount: "1" } as never, a);
  const body = await bodyOf(f);
  const r = await routeOf(POST as never, body);
  const res = r.json?.data?.result;
  return { issues: issuesOf(f), body, status: r.status, res, err: r.json?.error, notes: ((res?.warnings ?? []) as string[]).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다")) };
}

describe("자산 단위 이월과세 × 토지 나중 취득", () => {
  it("구간 입력: 파트 이월과세가 아니다 · ④가 겹침 58개월을 싣고 엔진이 규칙을 적용 — 토지 32% · 건물 80% · 산출세액 45,990,000 · 고지 0", async () => {
    const a = asset(interval);
    expect(anyPartCarryover(a)).toBe(false);
    expect(landHoldingResidenceApplies(a)).toBe(true);
    const r = await run(a);
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.err ?? {})).toBe(200);
    expect(r.body.landHoldingResidenceMonths).toBe(58);
    expect(r.body.residencePeriodMonths).toBe(175);
    expect(r.res.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.res.splitDetail.building.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.res.splitDetail.land.residenceYears).toBe(4);
    expect(r.res.calculatedTax).toBe(45_990_000);
    expect(r.notes).toHaveLength(0);
  });

  it("직접 178개월: 키 없음 · 엔진이 보유 개월로 상한 — 같은 32% · 같은 세액 · 고지 1건", async () => {
    const r = await run(asset(direct));
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("landHoldingResidenceMonths");
    expect(r.res.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.res.calculatedTax).toBe(45_990_000);
    expect(r.notes).toHaveLength(1);
  });

  it("판정 기준은 증여 등기접수일 — 토지 2005-01-01(증여자 취득일 뒤 · 접수일 앞)은 「토지가 먼저」: 키 없음 · 거주 14년 그대로(토지 80%)", async () => {
    for (const res of [interval, direct]) {
      const a = asset(res, { landAcquisitionDate: "2005-01-01" });
      expect(landHoldingResidenceApplies(a)).toBe(false);
      const r = await run(a);
      expect(r.status).toBe(200);
      expect(r.body).not.toHaveProperty("landHoldingResidenceMonths");
      expect(r.res.splitDetail.land.longTermRate).toBeCloseTo(0.8, 10);
      expect(r.notes).toHaveLength(0);
    }
  });

  it("토지가 접수일보다 늦되 거주 구간이 모두 토지 취득 전이 아닌 경우(토지 2012-01-01): 구간 입력은 겹침 156개월을 싣는다 · ⑤ 술어 ≡ ④", async () => {
    const a = asset(interval, { landAcquisitionDate: "2012-01-01" });
    expect(landHoldingResidenceApplies(a)).toBe(true);
    const r = await run(a);
    expect(r.status).toBe(200);
    expect(r.body.landHoldingResidenceMonths).toBe(156);
  });
});
