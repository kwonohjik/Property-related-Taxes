/**
 * 함께 양도 결과 «합산 과세 내역» 세율 행 — 중과를 두 번 더하지 않는다
 * (계획서 `docs/02-design/features/bundled-appurtenant-card-o18-o21-display.plan.md` O-18 · Q-1 a).
 *
 * `appliedRate`는 **이미 중과 포함 실효세율**이다(`transfer-tax-rate-calc.ts` `appliedRate: roundRate(baseRate + additionalRate * ratio)` · 상세명세서·신고서는 2026-09에 정정됨).
 * 종전 카드는 세율군이 하나일 때 `appliedRate + surchargeRate`를 값으로 적어 «기본 62% + 중과 20%p = 82%»로 보였다(산출세액은 62% 기준).
 *
 * 독립 산식(모의 세율표 · 양도 2026-06-15 · 2주택·조정 · 주택 1,600,000,000(취득 800,000,000) · 부수토지 400,000,000(취득 200,000,000) · 총 양도 2,000,000,000):
 *   과세표준 997,500,000 × 62%(= 42% + 20%p) − 누진공제 35,940,000 = 582,510,000. 82%였다면 782,010,000이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { capResidenceToHolding } from "../calc/_helpers/held-residence";
import { AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

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
/** 주택 첫 자산 · 부수토지 카드 `areaM2`㎡(주택 토지 취득면적 = 같은 면적) */
const fwd = (houseAcq: string, cardAcq: string, area: number) => ({
  ...COMMON, ...ZONE, propertyType: "housing", acquisitionDate: houseAcq, transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: area,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, companionAssets: [land("c1", cardAcq, area)],
});

async function summary(body: Loose) {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  const aggregated = (res.json as Loose).data.aggregated;
  const { container } = render(<AggregatedTaxSummary aggregated={aggregated} />);
  const rows = Array.from(container.querySelectorAll("tr")).map((tr) => tr.textContent ?? "");
  return { aggregated, rows, text: rows.join("\n") };
}

describe("합산 과세 내역 — 실효세율 하나만 적고 중과는 «포함»으로 알린다", () => {
  it("🔑 S1 세율군 하나(중과 한 군 · 2014·2014 · 100㎡): 값 62% · 라벨 «중과 20%p 포함» · 82% 없음 · 산출세액 582,510,000 = 과표 × 62% − 35,940,000", async () => {
    const { aggregated, rows, text } = await summary(fwd("2014-01-01", "2014-01-01", 100));
    const g = aggregated.groupTaxes;
    expect(g).toHaveLength(1);
    expect([g[0].group, g[0].groupTaxBase, g[0].appliedRate, g[0].surchargeRate, g[0].groupCalculatedTax]).toEqual(["multi_house_surcharge", 997_500_000, 0.62, 0.2, 582_510_000]);
    // 표시한 세율이 산출세액을 재현한다 — 독립 정수 식
    expect(Math.floor(997_500_000 * 0.62) - 35_940_000).toBe(582_510_000);
    const rateRow = rows.find((r) => r.startsWith("세율"))!;
    expect(rateRow).toContain("중과 20%p 포함");
    expect(rateRow).toMatch(/62%$/);
    expect(text).not.toContain("82%");
    expect(text).not.toContain("기본 62%");
  });

  it("🔑 S2 세율군 하나(중과 없는 단기 · 2025·2025): 접미 없음 · 값 60%", async () => {
    const { aggregated, rows } = await summary(fwd("2025-01-01", "2025-01-01", 100));
    expect(aggregated.groupTaxes).toHaveLength(1);
    expect(aggregated.groupTaxes[0].surchargeRate).toBeUndefined();
    const rateRow = rows.find((r) => r.startsWith("세율"))!;
    expect(rateRow).toBe("세율60%");
  });

  it("🔑 S3 세율군 여럿(중과 + 비사업용 · 200㎡): 각 군 값 + «(중과 N%p 포함)» — 값은 62%·34% 그대로 · «62% +20%p» 꼴 없음", async () => {
    const { aggregated, rows, text } = await summary(fwd("2014-01-01", "2014-01-01", 200));
    const byGroup = Object.fromEntries(aggregated.groupTaxes.map((g: Loose) => [g.group, g]));
    expect([byGroup.multi_house_surcharge.appliedRate, byGroup.multi_house_surcharge.surchargeRate]).toEqual([0.62, 0.2]);
    expect([byGroup.non_business_land.appliedRate, byGroup.non_business_land.surchargeRate]).toEqual([0.34, 0.1]);
    expect(rows.find((r) => r.startsWith("· 다주택 중과"))).toMatch(/62% \(중과 20%p 포함\)$/);
    expect(rows.find((r) => r.startsWith("· 비사업용토지"))).toMatch(/34% \(중과 10%p 포함\)$/);
    expect(text).not.toMatch(/\d+% \+\d+%p/);
  });

  it("S4 세율군 여럿(중과 없음 · 단기 + 일반): 접미 없음 — 값만", async () => {
    const { aggregated, rows } = await summary(fwd("2014-01-01", "2025-01-01", 100));
    expect(aggregated.groupTaxes.length).toBeGreaterThan(1);
    const groupRows = rows.filter((r) => r.startsWith("· ") && r.includes("과표"));
    // 중과 군이 있으면 그 행에만 접미가 붙고, 단기 군 행에는 붙지 않는다
    const shortRow = groupRows.find((r) => r.startsWith("· 단기보유"))!;
    expect(shortRow).toMatch(/60%$/);
    expect(shortRow).not.toContain("포함");
  });
});
