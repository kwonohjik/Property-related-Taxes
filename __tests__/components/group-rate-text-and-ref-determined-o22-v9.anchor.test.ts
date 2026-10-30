/**
 * ① O-22 — 세율군별 카드의 중과 군 문구는 «(62.0%, 중과 20%p 포함)» (계획서 `docs/02-design/features/appurtenant-card-o22-v9-o20-display.plan.md` Q-1 a)
 * ② V-9 — `refDeterminedTax`가 없는 옛 저장 이력의 fallback은 중과를 두 번 더하지 않는다 (Q-2 a)
 *
 * `appliedRate`는 **이미 중과 포함 실효세율**이다(`transfer-tax-rate-calc.ts` `appliedRate: roundRate(baseRate + additionalRate * ratio)`).
 * ① 종전 «(62.0% +20%p)»는 «62%에 20%p를 더한다»로도 읽혔다. ② 종전 fallback은 `appliedRate + surchargeRate`라 중과 자산에서 신규 결과 값보다 과대였다.
 *
 * 독립 산식(모의 세율표 · 양도 2026-06-15 · 2주택·조정 · 주택 1,600,000,000(취득 800,000,000) · 부수토지 400,000,000(취득 200,000,000) 200㎡ · 둘 다 2014-01-01 취득):
 *   주택 797,500,000 × 62% − 35,940,000 = 458,510,000 · 이내분 100,000,000 × 55% − 15,440,000 = 39,560,000 · 초과분 76,000,000 × 34% − 5,760,000 = 20,080,000.
 *   종전 fallback = 과표 × (실효 + 중과%p) − 누진공제 → 주택 797,500,000 × 82% − 35,940,000 = 618,010,000(+159,500,000 = 797,500,000 × 20%p).
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
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { groupRateText } from "@/components/calc/results/transfer/comparative-tax-display";
import { getRefDeterminedTax } from "@/components/calc/results/MultiTransferTaxSummaryCard";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const land = (id: string, acq: string, area: number) => ({
  assetId: id, assetLabel: `부수토지 ${id}`, assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: acq,
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: area, reductions: [],
});
const COMMON = {
  transferDate: "2026-06-15", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
  isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount: 2,
};
const fwd = (houseAcq: string, cardAcq: string, area: number) => ({
  ...COMMON, ...ZONE, propertyType: "housing", acquisitionDate: houseAcq, transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: area,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, companionAssets: [land("c1", cardAcq, area)],
});

async function aggregatedOf(body: Loose) {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated;
}

describe("① O-22 세율군별 카드 문구 — 실효세율 + «중과 N%p 포함»", () => {
  const base = { groupTaxBase: 1_000_000, groupCalculatedTax: 600_000, appliedRate: 0.6, progressiveDeduction: 0 };

  it("🔑 중과 군은 «(62.0%, 중과 20%p 포함)» — «+20%p» 꼴 없음", () => {
    const g = { groupTaxBase: 897_500_000, groupCalculatedTax: 520_510_000, appliedRate: 0.62, surchargeRate: 0.2, progressiveDeduction: 35_940_000 };
    // 문구가 주장하는 항등식이 성립하는 군이다 — 62%가 산출세액을 재현한다
    expect(Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction).toBe(g.groupCalculatedTax);
    expect(groupRateText(g)).toBe("(62.0%, 중과 20%p 포함)");
  });

  it("중과 없는 군은 접미 없음 · 호별 합계 문구 불변", () => {
    expect(groupRateText(base)).toBe("(60.0%)");
    expect(groupRateText({ ...base, surchargeRate: 0 })).toBe("(60.0%)");
    expect(groupRateText({ ...base, surchargeRate: undefined })).toBe("(60.0%)");
    // 단일 세율이 군 산출세액을 재현하지 못하면 중과가 있어도 세율을 적지 않는다
    expect(groupRateText({ ...base, surchargeRate: 0.2, groupCalculatedTax: 1 })).toBe("(호별 합계)");
  });

  it("🔑 시료 W(2주택 중과 + 비사업용 200㎡): 두 군 문구 — 값은 62%·34% 그대로", async () => {
    const a = await aggregatedOf(fwd("2014-01-01", "2014-01-01", 200));
    const text = Object.fromEntries(a.groupTaxes.map((g: Loose) => [g.group, groupRateText(g as Parameters<typeof groupRateText>[0])]));
    expect(text.multi_house_surcharge).toBe("(62.0%, 중과 20%p 포함)");
    expect(text.non_business_land).toBe("(34.0%, 중과 10%p 포함)");
  });
});

describe("② V-9 옛 이력(refDeterminedTax 없음) fallback — 중과 자산도 신규 결과와 같은 값", () => {
  const stale = (p: PerPropertyBreakdown) => {
    const b = { ...p } as Record<string, unknown>;
    delete b.refDeterminedTax;
    return b as unknown as PerPropertyBreakdown;
  };
  const W_REAL: Record<string, number> = { primary: 458_510_000, c1__appurtenant: 39_560_000, c1__excess: 20_080_000 };

  it("격자 — 세 자산 모두 중과가 붙어 있고(surchargeRate>0) 신규 값이 독립 산식과 같다", async () => {
    const a = await aggregatedOf(fwd("2014-01-01", "2014-01-01", 200));
    expect(a.properties).toHaveLength(3);
    for (const p of a.properties as PerPropertyBreakdown[]) {
      expect(p.surchargeRate ?? 0, `${p.propertyId} 중과가 없으면 이 anchor는 아무것도 구별하지 못한다`).toBeGreaterThan(0);
      expect(p.refDeterminedTax).toBe(W_REAL[p.propertyId]);
      expect(Math.floor(p.taxBaseShare * p.appliedRate) - p.progressiveDeduction).toBe(W_REAL[p.propertyId]);
    }
  });

  it("🔑 fallback = 신규 결과 값 (주택 458,510,000 · 이내분 39,560,000 · 초과분 20,080,000) — 종전 618,010,000 등", async () => {
    const a = await aggregatedOf(fwd("2014-01-01", "2014-01-01", 200));
    for (const p of a.properties as PerPropertyBreakdown[]) {
      expect(getRefDeterminedTax(stale(p)), p.propertyId).toBe(W_REAL[p.propertyId]);
    }
  });

  it("🔑 신고서 어댑터의 결정세액·지방소득세도 같다 — 주택 지방소득세 45,851,000", async () => {
    const a = await aggregatedOf(fwd("2014-01-01", "2014-01-01", 200));
    for (const p of a.properties as PerPropertyBreakdown[]) {
      const fr = breakdownToFilingResult(stale(p)) as unknown as Record<string, number>;
      expect(fr.determinedTax, p.propertyId).toBe(W_REAL[p.propertyId]);
      expect(fr.localIncomeTax, p.propertyId).toBe(Math.floor((W_REAL[p.propertyId] + p.penaltyTax) * 0.1));
    }
    const primary = (a.properties as PerPropertyBreakdown[]).find((p) => p.propertyId === "primary")!;
    expect((breakdownToFilingResult(stale(primary)) as unknown as Record<string, number>).localIncomeTax).toBe(45_851_000);
  });

  it("값이 있으면 그 값을 그대로 쓴다(신규 결과 경로 불변) · 비과세는 0", async () => {
    const a = await aggregatedOf(fwd("2014-01-01", "2014-01-01", 200));
    const p = a.properties[0] as PerPropertyBreakdown;
    expect(getRefDeterminedTax({ ...p, refDeterminedTax: 12_345 })).toBe(12_345);
    expect(getRefDeterminedTax({ ...stale(p), isExempt: true } as PerPropertyBreakdown)).toBe(0);
  });
});
